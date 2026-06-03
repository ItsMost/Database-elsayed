import { createClient } from '@supabase/supabase-js';
import { db } from './db';
import type { Player, SyncAction, ExpectedAttendee } from './types';

const SUPABASE_URL = 'https://koakdlbwsjekmtiunfhr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvYWtkbGJ3c2pla210aXVuZmhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNDEyNDUsImV4cCI6MjA4OTcxNzI0NX0.ZTXsET8hhtIebRmXiv1fHELmReGjVJlrq7HdlO9uWMI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let syncStatusCallback: ((status: 'online' | 'offline' | 'syncing') => void) | null = null;
let isProcessingQueue = false;

export function registerSyncStatusCallback(callback: (status: 'online' | 'offline' | 'syncing') => void) {
  syncStatusCallback = callback;
  // Trigger initial status
  callback(navigator.onLine ? 'online' : 'offline');
}

function updateSyncStatus(status: 'online' | 'offline' | 'syncing') {
  if (syncStatusCallback) {
    syncStatusCallback(status);
  }
}

/**
 * Triggers background sync for any changes queued while offline.
 */
export async function processSyncQueue(): Promise<boolean> {
  if (!navigator.onLine) {
    updateSyncStatus('offline');
    return false;
  }

  if (isProcessingQueue) return false;
  isProcessingQueue = true;

  try {
    const queue = await db.syncQueue.orderBy('timestamp').toArray();
    if (queue.length === 0) {
      updateSyncStatus('online');
      isProcessingQueue = false;
      return true;
    }

    updateSyncStatus('syncing');
    console.log(`Sync Manager: Processing ${queue.length} pending offline operations...`);

    for (const item of queue) {
      let success = false;

      if (item.action === 'save') {
        // Fetch most up-to-date player from local DB to sync
        const player = await db.players.get(item.playerId);
        if (player) {
          const { error } = await supabase
            .from('players_sync')
            .upsert({ id: String(player.id), player_data: player });
          
          if (!error) {
            success = true;
          } else {
            console.error(`Sync Manager: Error saving player ${item.playerId}`, error);
          }
        } else {
          // Player no longer exists locally, remove from queue
          success = true;
        }
      } else if (item.action === 'delete') {
        const { error } = await supabase
          .from('players_sync')
          .delete()
          .eq('id', String(item.playerId));
        
        if (!error) {
          success = true;
        } else {
          console.error(`Sync Manager: Error deleting player ${item.playerId}`, error);
        }
      } else if (item.action === 'save_expected') {
        const attendee = await db.expectedToday.get(item.playerId);
        if (attendee) {
          const { error } = await supabase
            .from('expected_today_sync')
            .upsert({ id: String(attendee.id), attendee_data: attendee });
          
          if (!error) {
            success = true;
          } else {
            console.error(`Sync Manager: Error saving expected attendee ${item.playerId}`, error);
          }
        } else {
          success = true;
        }
      } else if (item.action === 'delete_expected') {
        const { error } = await supabase
          .from('expected_today_sync')
          .delete()
          .eq('id', String(item.playerId));
        
        if (!error) {
          success = true;
        } else {
          console.error(`Sync Manager: Error deleting expected attendee ${item.playerId}`, error);
        }
      }

      if (success && item.id !== undefined) {
        await db.syncQueue.delete(item.id);
      } else {
        // Stop processing queue if an item fails (likely network/server issue)
        updateSyncStatus('offline');
        isProcessingQueue = false;
        return false;
      }
    }

    console.log("Sync Manager: Queue processed completely and successfully. ✅");
    updateSyncStatus('online');
    isProcessingQueue = false;
    return true;
  } catch (err) {
    console.error("Sync Manager: Fatal error in queue processing", err);
    updateSyncStatus('offline');
    isProcessingQueue = false;
    return false;
  }
}

/**
 * Queues a save action locally and attempts online cloud sync.
 */
export async function syncPlayerToCloud(player: Player) {
  player.last_updated = Date.now();
  
  // 1. Always save locally to IndexedDB first (Offline-First)
  await db.players.put(player);

  // 2. Queue for synchronization
  // Check if there is already a save operation for this player in the queue to avoid duplicates
  const existing = await db.syncQueue
    .where('playerId')
    .equals(player.id)
    .and(item => item.action === 'save')
    .first();
  
  if (!existing) {
    await db.syncQueue.add({
      playerId: player.id,
      action: 'save',
      timestamp: Date.now(),
    });
  }

  // 3. Attempt immediate sync in background
  processSyncQueue();
}

/**
 * Queues a delete action locally and attempts online cloud sync.
 */
export async function deletePlayerFromCloud(playerId: string) {
  // 1. Always delete locally first
  await db.players.delete(playerId);

  // 2. Clear any pending saves in queue and add a delete action
  await db.syncQueue.where('playerId').equals(playerId).delete();
  await db.syncQueue.add({
    playerId,
    action: 'delete',
    timestamp: Date.now(),
  });

  // 3. Attempt immediate sync in background
  processSyncQueue();
}

/**
 * Syncs all local players to the cloud (bulk operation).
 */
export async function syncAllToCloud(players: Player[]) {
  if (!navigator.onLine) return;
  updateSyncStatus('syncing');

  try {
    const upsertData = players.map(p => ({ id: String(p.id), player_data: p }));
    const { error } = await supabase.from('players_sync').upsert(upsertData);
    if (error) {
      console.error("Sync Manager: Bulk upload error:", error);
      updateSyncStatus('offline');
    } else {
      updateSyncStatus('online');
    }
  } catch (err) {
    console.error("Sync Manager: Bulk upload network error:", err);
    updateSyncStatus('offline');
  }
}

/**
 * Startup cloud sync that pulls from Supabase and merges with local data.
 */
export async function fetchInitialDataFromSupabase(): Promise<Player[]> {
  if (!navigator.onLine) {
    updateSyncStatus('offline');
    return [];
  }

  updateSyncStatus('syncing');
  try {
    let allData: any[] = [];
    let count = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('players_sync')
        .select('*')
        .range(count, count + pageSize - 1);
      
      if (error) throw error;
      if (data && data.length > 0) {
        allData = allData.concat(data);
        count += data.length;
        if (data.length < pageSize) break;
      } else {
        break;
      }
    }

    const cloudPlayers: Player[] = allData.map(row => row.player_data);
    const localPlayers = await db.players.toArray();

    // Merge logic: Merge cloud and local players, keeping the newest last_updated
    const mergedMap = new Map<string, Player>();
    localPlayers.forEach(p => mergedMap.set(String(p.id), p));

    let needsCloudUpload = false;

    cloudPlayers.forEach(cloudP => {
      const localP = mergedMap.get(String(cloudP.id));
      if (!localP || (cloudP.last_updated || 0) >= (localP.last_updated || 0)) {
        mergedMap.set(String(cloudP.id), cloudP);
      } else {
        needsCloudUpload = true;
      }
    });

    if (localPlayers.length > cloudPlayers.length) {
      needsCloudUpload = true;
    }

    const finalPlayers = Array.from(mergedMap.values());
    
    // Save to local database
    await db.players.bulkPut(finalPlayers);
    updateSyncStatus('online');

    if (needsCloudUpload) {
      syncAllToCloud(finalPlayers);
    }

    return finalPlayers;
  } catch (e) {
    console.error("Sync Manager: Initial load network error:", e);
    updateSyncStatus('offline');
    return [];
  }
}

/**
 * Queues a save action locally and attempts online cloud sync for expected attendees.
 */
export async function syncExpectedAttendeeToCloud(attendee: ExpectedAttendee) {
  attendee.last_updated = Date.now();
  
  // 1. Always save locally to IndexedDB first
  await db.expectedToday.put(attendee);

  // 2. Queue for synchronization
  const existing = await db.syncQueue
    .where('playerId')
    .equals(attendee.id)
    .and(item => item.action === 'save_expected')
    .first();
  
  if (!existing) {
    await db.syncQueue.add({
      playerId: attendee.id,
      action: 'save_expected',
      timestamp: Date.now(),
    });
  }

  // 3. Attempt immediate sync in background
  processSyncQueue();
}

export async function deleteExpectedAttendeeFromCloud(id: string) {
  // Soft-delete expected attendee by setting isDeleted = true and syncing
  const attendee = await db.expectedToday.get(id);
  if (attendee) {
    const updated: ExpectedAttendee = {
      ...attendee,
      isDeleted: true,
    };
    await syncExpectedAttendeeToCloud(updated);
  }
}

/**
 * Startup cloud sync that pulls from Supabase and merges with local expected attendees.
 */
export async function fetchInitialExpectedAttendeesFromSupabase(): Promise<ExpectedAttendee[]> {
  if (!navigator.onLine) {
    updateSyncStatus('offline');
    return [];
  }

  updateSyncStatus('syncing');
  try {
    let allData: any[] = [];
    let count = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('expected_today_sync')
        .select('*')
        .range(count, count + pageSize - 1);
      
      if (error) throw error;
      if (data && data.length > 0) {
        allData = allData.concat(data);
        count += data.length;
        if (data.length < pageSize) break;
      } else {
        break;
      }
    }

    const cloudExpected: ExpectedAttendee[] = allData.map(row => row.attendee_data);
    const localExpected = await db.expectedToday.toArray();

    // Merge logic: Merge cloud and local expected attendees, keeping the newest last_updated
    const mergedMap = new Map<string, ExpectedAttendee>();
    localExpected.forEach(p => mergedMap.set(String(p.id), p));

    let needsCloudUpload = false;

    cloudExpected.forEach(cloudP => {
      const localP = mergedMap.get(String(cloudP.id));
      if (!localP || (cloudP.last_updated || 0) >= (localP.last_updated || 0)) {
        mergedMap.set(String(cloudP.id), cloudP);
      } else {
        needsCloudUpload = true;
      }
    });

    if (localExpected.length > cloudExpected.length) {
      needsCloudUpload = true;
    }

    const finalExpected = Array.from(mergedMap.values());
    
    // Save to local database
    await db.expectedToday.bulkPut(finalExpected);
    updateSyncStatus('online');

    if (needsCloudUpload) {
      // Bulk upsert expected attendees
      const upsertData = finalExpected.map(p => ({ id: String(p.id), attendee_data: p }));
      await supabase.from('expected_today_sync').upsert(upsertData);
    }

    return finalExpected;
  } catch (e) {
    console.error("Sync Manager: Initial load expected attendees network error:", e);
    updateSyncStatus('offline');
    return [];
  }
}

// 4. Set up window online/offline listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log("Network Status: Online. Retrying synchronization...");
    processSyncQueue();
  });
  window.addEventListener('offline', () => {
    console.log("Network Status: Offline.");
    updateSyncStatus('offline');
  });
}
