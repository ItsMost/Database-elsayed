import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { RosterSection } from './components/RosterSection';
import { ActiveSection } from './components/ActiveSection';
import { SportsSection } from './components/SportsSection';
import { ProfileSection } from './components/ProfileSection';
import {
  db,
  runMigration,
} from './db';
import {
  supabase,
  registerSyncStatusCallback,
  syncPlayerToCloud,
  deletePlayerFromCloud,
  fetchInitialDataFromSupabase,
  syncAllToCloud,
} from './supabase';
import type { Player, HistoryEntry, ExpectedAttendee } from './types';

export const App: React.FC = () => {
  // Global View states
  const [theme, setTheme] = useState(localStorage.getItem('sys_theme') || 'solo');
  const [mode, setMode] = useState(localStorage.getItem('sys_mode') || 'dark');
  const [activeTab, setActiveTab] = useState<'roster' | 'active' | 'sports' | 'profile'>('roster');
  const [syncStatus, setSyncStatus] = useState<'online' | 'offline' | 'syncing'>('offline');
  
  // Players database state
  const [players, setPlayers] = useState<Player[]>([]);

  // Expected Attendees state
  const [expectedAttendees, setExpectedAttendees] = useState<ExpectedAttendee[]>([]);
  
  // Search & filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [sportFilter, setSportFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  
  // Roster / payment linking state
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  // Toast Notification state
  const [toastMessage, setToastMessage] = useState('');
  const [toastIsError, setToastIsError] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // History modal state
  const [historyPlayerId, setHistoryPlayerId] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<'payments' | 'calendar'>('payments');
  const [calCurrentDate, setCalCurrentDate] = useState(new Date());

  // Delete Confirmation state
  const [playerToDeleteId, setPlayerToDeleteId] = useState<string | null>(null);

  // General Reset Month Confirmation state
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // General Backup/Import text modals
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [backupText, setBackupText] = useState('');
  const [importText, setImportText] = useState('');

  // 1. Load theme and mode configurations
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('sys_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.body.setAttribute('data-mode', mode);
    localStorage.setItem('sys_mode', mode);
  }, [mode]);

  // 2. Initialize sync status callbacks
  useEffect(() => {
    registerSyncStatusCallback((status) => {
      setSyncStatus(status);
    });
  }, []);

  // 3. Database Startup & Real-time Cloud Subscriptions
  useEffect(() => {
    const initializeData = async () => {
      // Step A: Run local data migration service
      const localData = await runMigration();
      const allPlayers = await db.players.toArray();
      setPlayers(allPlayers);

      // Load expected attendees
      const allExpected = await db.expectedToday.toArray();
      setExpectedAttendees(allExpected);

      // Step B: Pull initial cloud data and merge
      if (navigator.onLine) {
        setTimeout(async () => {
          const syncedPlayers = await fetchInitialDataFromSupabase();
          if (syncedPlayers.length > 0) {
            setPlayers(syncedPlayers);
          }
        }, 1000);
      }
    };

    initializeData();

    // Step C: Listen to real-time database modifications via Supabase postgres channel
    const channel = supabase
      .channel('realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players_sync' },
        async (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const cloudP = payload.new.player_data as Player;
            if (cloudP && cloudP.id) {
              const localP = await db.players.get(cloudP.id);
              if (!localP || (cloudP.last_updated || 0) >= (localP.last_updated || 0)) {
                await db.players.put(cloudP);
                const updatedList = await db.players.toArray();
                setPlayers(updatedList);
              }
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            if (deletedId) {
              await db.players.delete(deletedId);
              const updatedList = await db.players.toArray();
              setPlayers(updatedList);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Toast trigger helper
  const triggerToast = (message: string, isError = false) => {
    setToastMessage(message);
    setToastIsError(isError);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  const getTodayDate = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  const getFormattedDate = (year: number, month: number, day: number) => {
    const d = new Date(year, month, day);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  const checkExpiration = (player: Player) => {
    if (!player.startDate || !player.subType) return { isExpired: true, days: 0, endDateStr: '-' };
    const startD = new Date(player.startDate);
    const endD = new Date(startD);
    
    if (player.subType === 'حصة واحدة') {
      endD.setDate(endD.getDate() + 1);
    } else {
      endD.setMonth(endD.getMonth() + 1);
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endD.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - endD.getTime();
    
    return {
      isExpired: diffTime > 0,
      days: diffTime > 0 ? Math.floor(diffTime / (1000 * 60 * 60 * 24)) : 0,
      endDateStr: endD.toLocaleDateString('en-GB'),
    };
  };

  // --- Core CRUD Actions ---

  // Save/Register Player
  const handleSavePlayer = async (playerData: Omit<Player, 'attendance' | 'history'>) => {
    const existing = await db.players.get(playerData.id);
    const newPlayer: Player = {
      ...existing,
      ...playerData,
      attendance: existing?.attendance || [],
      history: existing?.history || [],
    };

    await syncPlayerToCloud(newPlayer);
    const updatedList = await db.players.toArray();
    setPlayers(updatedList);
    setEditingPlayer(null);
    triggerToast(existing ? "تم تحديث بيانات اللاعب بنجاح ✅" : "تم تسجيل اللاعب في القاعدة بنجاح ✅");
  };

  // Delete Player
  const handleDeletePlayer = async () => {
    if (!playerToDeleteId) return;
    
    await deletePlayerFromCloud(playerToDeleteId);
    const updatedList = await db.players.toArray();
    setPlayers(updatedList);
    setPlayerToDeleteId(null);
    triggerToast("تم مسح اللاعب وأرباحه بالكامل من النظام", true);
  };

  // Save Subscription Payment details
  const handleSaveSubscription = async (
    playerId: string,
    subData: { subType: string; startDate: string; paid: number; cost: number },
    isEdit = false
  ) => {
    const p = await db.players.get(playerId);
    if (!p) return;

    let history = p.history ? [...p.history] : [];
    
    if (isEdit && history.length > 0) {
      // Edit the last history entry (which represents the current subscription)
      const lastIdx = history.length - 1;
      history[lastIdx] = {
        ...history[lastIdx],
        date: subData.startDate,
        subType: subData.subType,
        paid: subData.paid,
        cost: subData.cost,
        desc: subData.subType,
        // Keep the original timestamp to preserve order
      };
    } else {
      // Append a new history entry
      const newHistoryEntry: HistoryEntry = {
        date: subData.startDate,
        subType: subData.subType,
        paid: subData.paid,
        cost: subData.cost,
        timestamp: Date.now(),
        desc: subData.subType,
      };
      history.push(newHistoryEntry);
    }

    const attendance = p.attendance ? [...p.attendance] : [];
    if (subData.subType === 'حصة واحدة') {
      if (!attendance.includes(subData.startDate)) {
        attendance.push(subData.startDate);
      }
    }

    const updatedPlayer: Player = {
      ...p,
      subType: subData.subType,
      startDate: subData.startDate,
      paid: subData.paid,
      cost: subData.cost,
      history,
      attendance,
    };

    await syncPlayerToCloud(updatedPlayer);
    const updatedList = await db.players.toArray();
    setPlayers(updatedList);
    triggerToast(isEdit ? "تم تعديل الاشتراك والدفعة بنجاح ✏️" : "تم تسجيل الدفع وتنشيط الاشتراك بنجاح ✅");
  };

  // Cancel Active Subscription
  const handleCancelSubscription = async (playerId: string) => {
    const p = await db.players.get(playerId);
    if (!p) return;

    const updatedPlayer: Player = {
      ...p,
      subType: '',
      startDate: '',
      paid: 0,
      cost: 0,
    };

    await syncPlayerToCloud(updatedPlayer);
    const updatedList = await db.players.toArray();
    setPlayers(updatedList);
    triggerToast("تم إلغاء الاشتراك بنجاح وتصفير حالة الحصص", true);
  };

  // Attendance Controls
  const handleAddAttendance = async (playerId: string, dateStr: string) => {
    const p = await db.players.get(playerId);
    if (!p) return;

    const attendance = p.attendance ? [...p.attendance] : [];
    if (!attendance.includes(dateStr)) {
      attendance.push(dateStr);
      const updatedPlayer = { ...p, attendance };
      await syncPlayerToCloud(updatedPlayer);
      const updatedList = await db.players.toArray();
      setPlayers(updatedList);
      triggerToast(`تم تسجيل حضور يوم ${dateStr} 🟢`);
    } else {
      triggerToast("هذا اليوم مسجل مسبقاً للحضور!", true);
    }
  };

  const handleRemoveAttendance = async (playerId: string, dateStr: string) => {
    const p = await db.players.get(playerId);
    if (!p || !p.attendance) return;

    const attendance = p.attendance.filter(d => d !== dateStr);
    const updatedPlayer = { ...p, attendance };
    await syncPlayerToCloud(updatedPlayer);
    const updatedList = await db.players.toArray();
    setPlayers(updatedList);
    triggerToast(`تم إلغاء حضور يوم ${dateStr} 🔴`, true);
  };

  // Calendar Attendance click toggle
  const handleToggleCalendarDay = async (playerId: string, dateStr: string) => {
    const p = await db.players.get(playerId);
    if (!p) return;

    const attendance = p.attendance ? [...p.attendance] : [];
    const index = attendance.indexOf(dateStr);
    
    if (index > -1) {
      attendance.splice(index, 1);
      triggerToast(`تم إلغاء حضور يوم ${dateStr} 🔴`, true);
    } else {
      attendance.push(dateStr);
      triggerToast(`تم تسجيل حضور يوم ${dateStr} 🟢`);
    }

    const updatedPlayer = { ...p, attendance };
    await syncPlayerToCloud(updatedPlayer);
    const updatedList = await db.players.toArray();
    setPlayers(updatedList);
  };

  const handleDeleteHistoryEntry = async (playerId: string, timestamp: number) => {
    const p = await db.players.get(playerId);
    if (!p || !p.history) return;

    const history = p.history.filter(h => h.timestamp !== timestamp);
    const updatedPlayer = { ...p, history };
    await syncPlayerToCloud(updatedPlayer);
    const updatedList = await db.players.toArray();
    setPlayers(updatedList);
    triggerToast("تم مسح المعاملة بنجاح وتحديث الخزنة ✅", true);
  };

  // Expenses management
  const handleSaveExpense = async (desc: string, cost: number, date: string) => {
    let sys = await db.players.get('sys_expenses');
    if (!sys) {
      sys = { id: 'sys_expenses', isSystem: true, name: 'المصروفات العامة', history: [] };
    }

    const newExpense: HistoryEntry = {
      desc,
      cost,
      paid: 0,
      date,
      timestamp: Date.now(),
      subType: 'مصروف',
    };

    const updatedSys: Player = {
      ...sys,
      history: sys.history ? [...sys.history, newExpense] : [newExpense],
    };

    await syncPlayerToCloud(updatedSys);
    const updatedList = await db.players.toArray();
    setPlayers(updatedList);
    triggerToast("تم تسجيل المصروف بنجاح 💸");
  };

  const handleDeleteExpense = async (timestamp: number) => {
    const sys = await db.players.get('sys_expenses');
    if (!sys || !sys.history) return;

    const history = sys.history.filter(h => h.timestamp !== timestamp);
    const updatedSys = { ...sys, history };
    await syncPlayerToCloud(updatedSys);
    const updatedList = await db.players.toArray();
    setPlayers(updatedList);
    triggerToast("تم مسح المصروف وتحديث الخزنة بنجاح ✅", true);
  };

  // --- Expected Attendees Actions ---
  const handleAddExpectedAttendee = async (attendee: Omit<ExpectedAttendee, 'id'>) => {
    await db.expectedToday.add(attendee);
    const updated = await db.expectedToday.toArray();
    setExpectedAttendees(updated);
    triggerToast("تمت الإضافة للمتوقع حضورهم اليوم 📋");
  };

  const handleDeleteExpectedAttendee = async (id: number) => {
    await db.expectedToday.delete(id);
    const updated = await db.expectedToday.toArray();
    setExpectedAttendees(updated);
    triggerToast("تم مسح اللاعب من المتوقع حضورهم", true);
  };

  const handleApplyExpectedAttendee = async (attendee: ExpectedAttendee) => {
    // 1. Check if player already exists in the real players database by name
    let player = players.find(p => p.name.trim().toLowerCase() === attendee.name.trim().toLowerCase());
    
    if (!player) {
      // Create a brand new player
      let maxNum = 0;
      players.filter(p => !p.isSystem).forEach(p => {
        const num = parseInt(p.number || '0', 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      const newNum = String(maxNum + 1).padStart(3, '0');

      const newId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
      const newPlayer: Player = {
        id: newId,
        number: newNum,
        name: attendee.name,
        sport: attendee.sport || 'General',
        attendance: [],
        history: [],
      };
      
      await db.players.put(newPlayer);
      player = newPlayer;
    }

    // 2. Register the subscription / payment for them
    const newHistoryEntry: HistoryEntry = {
      date: attendee.date,
      subType: attendee.subType,
      paid: attendee.paid,
      cost: attendee.subType === 'حصة واحدة' ? 60 : (attendee.subType === '8 حصص' ? 480 : (attendee.subType === '12 حصة' ? 720 : (attendee.subType === '16 حصة' ? 960 : 1200))), // Default cost
      timestamp: Date.now(),
      desc: attendee.subType,
    };

    const attendance = player.attendance ? [...player.attendance] : [];
    if (!attendance.includes(attendee.date)) {
      attendance.push(attendee.date);
    }

    const updatedPlayer: Player = {
      ...player,
      subType: attendee.subType,
      startDate: attendee.date,
      paid: attendee.paid,
      cost: newHistoryEntry.cost,
      history: player.history ? [...player.history, newHistoryEntry] : [newHistoryEntry],
      attendance,
    };

    await syncPlayerToCloud(updatedPlayer);

    // 3. Remove from expectedToday
    if (attendee.id !== undefined) {
      await db.expectedToday.delete(attendee.id);
    }

    // 4. Update states
    const updatedPlayers = await db.players.toArray();
    const updatedExpected = await db.expectedToday.toArray();
    
    setPlayers(updatedPlayers);
    setExpectedAttendees(updatedExpected);
    triggerToast(`تم تسجيل الحضور وتفعيل الاشتراك للاعب [${attendee.name}] ✅`);
  };

  // Reset Current Month Profit and attendance logs
  const handleResetMonth = async () => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const allPlayers = await db.players.toArray();
    const updatedList: Player[] = [];

    for (const p of allPlayers) {
      let changed = false;
      let history = p.history ? [...p.history] : [];
      let attendance = p.attendance ? [...p.attendance] : [];
      let subType = p.subType;
      let startDate = p.startDate;
      let paid = p.paid;
      let cost = p.cost;

      if (history.length > 0) {
        const origLength = history.length;
        history = history.filter(h => {
          const hDate = new Date(h.date);
          return !(hDate.getMonth() === currentMonth && hDate.getFullYear() === currentYear);
        });
        if (history.length !== origLength) changed = true;
      }

      if (!p.isSystem) {
        if (attendance.length > 0) {
          const origLength = attendance.length;
          attendance = attendance.filter(dStr => {
            const [y, m] = dStr.split('-');
            return !(parseInt(y) === currentYear && parseInt(m) - 1 === currentMonth);
          });
          if (attendance.length !== origLength) changed = true;
        }

        if (startDate) {
          const sDate = new Date(startDate);
          if (sDate.getMonth() === currentMonth && sDate.getFullYear() === currentYear) {
            subType = '';
            startDate = '';
            paid = 0;
            cost = 0;
            changed = true;
          }
        }
      }

      const updatedPlayer: Player = {
        ...p,
        history,
        attendance,
        subType,
        startDate,
        paid,
        cost,
      };

      if (changed) {
        await syncPlayerToCloud(updatedPlayer);
      }
      updatedList.push(updatedPlayer);
    }

    setPlayers(updatedList);
    triggerToast("تم تصفير أرباح وحضور الشهر الحالي بالكامل بنجاح 🗑️", true);
  };

  // Deep backup database recover scanner
  const handleDeepRecover = async () => {
    const recoveredMap = new Map<string, Player>();
    
    // 1. Read all local storage values that look like JSON arrays
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '');
          if (Array.isArray(data)) {
            data.forEach((p: Player) => {
              if (p && p.id && p.name) {
                recoveredMap.set(String(p.id), p);
              }
            });
          }
        } catch {}
      }
    }

    // 2. Read native IDB ('SystemPlayersDB')
    try {
      const idbPlayers = await new Promise<Player[]>((resolve) => {
        const req = indexedDB.open("SystemPlayersDB", 1);
        req.onsuccess = (e) => {
          const nativeDb = (e.target as IDBOpenDBRequest).result;
          if (!nativeDb.objectStoreNames.contains("state")) {
            nativeDb.close();
            resolve([]);
            return;
          }
          try {
            const tx = nativeDb.transaction("state", "readonly");
            const store = tx.objectStore("state");
            const getReq = store.get("playersData");
            getReq.onsuccess = () => {
              nativeDb.close();
              resolve(Array.isArray(getReq.result) ? getReq.result : []);
            };
            getReq.onerror = () => {
              nativeDb.close();
              resolve([]);
            };
          } catch {
            nativeDb.close();
            resolve([]);
          }
        };
        req.onerror = () => resolve([]);
      });

      idbPlayers.forEach((p) => {
        if (p && p.id && p.name) {
          recoveredMap.set(String(p.id), p);
        }
      });
    } catch {}

    // 3. Keep newer records
    players.forEach(p => {
      recoveredMap.set(String(p.id), p);
    });

    const newPlayers = Array.from(recoveredMap.values());
    
    if (newPlayers.length > players.length) {
      await db.players.bulkPut(newPlayers);
      if (navigator.onLine) {
        await syncAllToCloud(newPlayers);
      }
      setPlayers(newPlayers);
      triggerToast(`تم استرجاع ${newPlayers.length} ملفات بنجاح! ✅`);
    } else {
      triggerToast("لم يتم العثور على أي ملفات احتياطية قديمة.", true);
    }
  };

  // CSV Sheet download
  const handleExportCSV = () => {
    let csvContent = '\uFEFF'; // Excel UTF-8 BOM to support Arabic letters
    csvContent += "الرقم,الاسم,رقم الموبايل,الرياضة,حالة الاشتراك,تاريخ البداية,إجمالي الدفع,إجمالي تكلفة الجيم,صافي الربح\n";
    
    players.filter(p => !p.isSystem).forEach(p => {
      let totalPaid = 0;
      let totalCost = 0;
      if (p.history) {
        p.history.forEach(h => {
          totalPaid += h.paid || 0;
          totalCost += h.cost || 0;
        });
      }
      const net = totalPaid - totalCost;
      const expInfo = checkExpiration(p);
      const status = p.subType && !expInfo.isExpired ? "ساري" : "منتهي/غير مسدد";
      
      const cleanName = (p.name || '').replace(/,/g, ' ');
      const cleanSport = (p.sport || '').replace(/,/g, ' ');
      
      const row = `${p.number || '-'},${cleanName},${p.phone || '-'},${cleanSport},${status},${p.startDate || '-'},${totalPaid},${totalCost},${net}`;
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Gym_Players_Report_${getTodayDate()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerToast("تم تصدير الداتا بنجاح في ملف إكسيل 📊");
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(players);
    setBackupText(dataStr);
    setShowBackupModal(true);
  };

  const handleCopyBackup = () => {
    navigator.clipboard.writeText(backupText);
    triggerToast("تم نسخ الكود! اذهب لعمل (لصق/Paste) في مكان آمن ✅");
    setShowBackupModal(false);
  };

  const handleDownloadBackupFile = () => {
    const blob = new Blob([backupText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Gym_System_Backup_${getTodayDate()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerToast("تم تنزيل ملف النسخة الاحتياطية بنجاح 📁✅");
    setShowBackupModal(false);
  };

  const handleImportJSON = () => {
    setImportText('');
    setShowImportModal(true);
  };

  const handleExecuteImport = async () => {
    if (!importText.trim()) {
      alert("الرجاء لصق الكود أولاً!");
      return;
    }
    
    try {
      const parsed = JSON.parse(importText);
      if (Array.isArray(parsed)) {
        await db.players.clear();
        await db.players.bulkPut(parsed);
        if (navigator.onLine) {
          await syncAllToCloud(parsed);
        }
        setPlayers(parsed);
        triggerToast("تم استرجاع جميع بياناتك بنجاح! ✅");
        setShowImportModal(false);
      } else {
        triggerToast("كود تالف وغير صحيح!", true);
      }
    } catch {
      triggerToast("كود غير مكتمل أو منتهي الصلاحية!", true);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      setImportText(content);
    };
    reader.readAsText(file);
  };

  // --- Shared computed stats for Header dashboard ---
  const getCurrentMonthBenefit = () => {
    const currMonth = new Date().getMonth();
    const currYear = new Date().getFullYear();
    let totalRevenue = 0;
    let totalGymCost = 0;
    let totalExpenses = 0;

    players.forEach(p => {
      if (p.isSystem) {
        p.history?.forEach(h => {
          const hDate = new Date(h.date);
          if (hDate.getMonth() === currMonth && hDate.getFullYear() === currYear) {
            totalExpenses += h.cost || 0;
          }
        });
      } else {
        p.history?.forEach(h => {
          const hDate = new Date(h.date);
          if (hDate.getMonth() === currMonth && hDate.getFullYear() === currYear) {
            totalRevenue += h.paid || 0;
            totalGymCost += h.cost || 0;
          }
        });
      }
    });

    return {
      netProfit: totalRevenue - totalGymCost - totalExpenses,
      revenue: totalRevenue,
      cost: totalGymCost,
      expenses: totalExpenses,
    };
  };

  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  const monthBenefit = getCurrentMonthBenefit();
  const currentMonthLabel = monthNames[new Date().getMonth()];

  const getCalendarDays = () => {
    if (!historyPlayerId) return [];
    const p = players.find(x => x.id === historyPlayerId);
    if (!p) return [];

    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const cells = [];
    // Padding for empty days at start of month
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`}></div>);
    }

    const attendanceSet = new Set(p.attendance || []);
    for (let i = 1; i <= lastDate; i++) {
      const formattedDate = getFormattedDate(year, month, i);
      const isAttended = attendanceSet.has(formattedDate);
      const dayClass = isAttended
        ? "cal-attended hover:opacity-80 cursor-pointer"
        : "cal-empty input-bg border border-theme hover:bg-primary-glow/20 cursor-pointer transition-all";

      cells.push(
        <div
          key={i}
          className={`cal-day ${dayClass}`}
          onClick={() => handleToggleCalendarDay(historyPlayerId, formattedDate)}
          title="اضغط لتسجيل/إلغاء الحضور"
        >
          {i}
        </div>
      );
    }
    return cells;
  };

  const historyPlayer = players.find(x => x.id === historyPlayerId);

  // Compute sport lists suggestions dynamically
  const defaultSports = ['Volleyball', 'Basketball', 'Soccer', 'Squash', 'Swimming', 'General'];
  const currentSports = players.filter(p => !p.isSystem).map(p => p.sport || 'General');
  const allSports = [...new Set([...defaultSports, ...currentSports])];

  return (
    <div className="max-w-md mx-auto min-h-screen relative pb-20">
      {/* 1. Header controls (Theme, sync, modes) */}
      <Header
        theme={theme}
        setTheme={setTheme}
        mode={mode}
        setMode={setMode}
        syncStatus={syncStatus}
      />

      {/* 2. Month overview treasury summary */}
      <div className="card-bg text-main mx-4 pt-4 pb-4 px-6 rounded-b-3xl text-center mb-4 mt-2 relative">
        <h1 className="text-2xl font-bold mb-2 glow-text tracking-widest text-primary">[ SYSTEM ]</h1>
        <p className="text-muted text-sm mb-1 flex items-center justify-center gap-2">
          <span>أرباح شهر ({currentMonthLabel})</span>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="text-danger bg-danger/10 hover:bg-danger hover:text-white border border-danger/20 rounded px-2 py-0.5 text-[10px] transition-all"
            title="مسح أرباح وحضور الشهر الحالي بالكامل"
          >
            تصفير 🗑️
          </button>
        </p>
        <div className="text-3xl font-bold tracking-tight text-primary-light glow-text">
          {monthBenefit.netProfit} <span className="text-lg font-normal">ج.م</span>
        </div>
        
        <div className="text-[10px] sm:text-xs text-muted mt-3 flex justify-center gap-3 border-t border-theme/50 pt-2">
          <span>إيرادات: <b className="text-success text-sm">{monthBenefit.revenue} ج.م</b></span>
          <span>جيم: <b className="text-danger text-sm">{monthBenefit.cost} ج.م</b></span>
          <span>مصروفات: <b className="text-orange-400 text-sm">{monthBenefit.expenses} ج.م</b></span>
        </div>
      </div>

      {/* 3. Main Navigation Tab */}
      <div className="flex border-b border-theme mb-6 px-1">
        <button
          onClick={() => setActiveTab('roster')}
          className={`w-1/4 py-3 text-center text-[11px] sm:text-xs font-bold transition-all rounded-t-lg ${
            activeTab === 'roster' ? 'tab-active' : 'tab-inactive'
          }`}
        >
          القاعدة
        </button>
        <button
          onClick={() => setActiveTab('active')}
          className={`w-1/4 py-3 text-center text-[11px] sm:text-xs font-bold transition-all rounded-t-lg ${
            activeTab === 'active' ? 'tab-active' : 'tab-inactive'
          }`}
        >
          الاشتراكات
        </button>
        <button
          onClick={() => setActiveTab('sports')}
          className={`w-1/4 py-3 text-center text-[11px] sm:text-xs font-bold transition-all rounded-t-lg ${
            activeTab === 'sports' ? 'tab-active' : 'tab-inactive'
          }`}
        >
          الرياضات 🏅
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`w-1/4 py-3 text-center text-[11px] sm:text-xs font-bold transition-all rounded-t-lg ${
            activeTab === 'profile' ? 'tab-active' : 'tab-inactive'
          }`}
        >
          البروفايل 👤
        </button>
      </div>

      {/* 4. Shared Search Block */}
      {(activeTab === 'roster' || activeTab === 'active') && (
        <div className="mb-6 flex flex-col gap-2 px-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 ابحث عن لاعب بالاسم أو الرقم..."
            className="w-full input-bg rounded-lg px-3 py-3 transition-colors text-sm border border-theme"
          />
          <div className="flex gap-2">
            <select
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
              className="w-1/2 input-bg rounded-lg px-2 py-3 text-sm border border-theme"
            >
              <option value="All">كل الرياضات</option>
              {allSports.map((s, idx) => (
                <option key={idx} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-1/2 input-bg rounded-lg px-2 py-3 text-sm border border-theme text-muted"
            />
          </div>
        </div>
      )}

      {/* 5. Sub-sections content rendering */}
      <div className="px-4">
        {activeTab === 'roster' && (
          <RosterSection
            players={players}
            searchQuery={searchQuery}
            sportFilter={sportFilter}
            dateFilter={dateFilter}
            onSavePlayer={handleSavePlayer}
            onEditSelect={setEditingPlayer}
            editingPlayer={editingPlayer}
            onDeletePlayer={setPlayerToDeleteId}
            onOpenPayment={(id) => {
              setSelectedPlayerId(id);
              setActiveTab('active');
            }}
            onOpenHistory={setHistoryPlayerId}
            checkExpiration={checkExpiration}
            allSports={allSports}
          />
        )}

        {activeTab === 'active' && (
          <ActiveSection
            players={players}
            selectedPlayerId={selectedPlayerId}
            setSelectedPlayerId={setSelectedPlayerId}
            onSaveSubscription={handleSaveSubscription}
            onCancelSubscription={handleCancelSubscription}
            checkExpiration={checkExpiration}
            onAddAttendance={handleAddAttendance}
            onRemoveAttendance={handleRemoveAttendance}
            getTodayDate={getTodayDate}
            searchQuery={searchQuery}
            sportFilter={sportFilter}
            dateFilter={dateFilter}
            expectedAttendees={expectedAttendees}
            onAddExpectedAttendee={handleAddExpectedAttendee}
            onDeleteExpectedAttendee={handleDeleteExpectedAttendee}
            onApplyExpectedAttendee={handleApplyExpectedAttendee}
            allSports={allSports}
          />
        )}

        {activeTab === 'sports' && <SportsSection players={players} />}

        {activeTab === 'profile' && (
          <ProfileSection
            players={players}
            onSaveExpense={handleSaveExpense}
            onDeleteExpense={handleDeleteExpense}
            onExportCSV={handleExportCSV}
            onExportJSON={handleExportJSON}
            onImportJSON={handleImportJSON}
            onDeepRecover={handleDeepRecover}
            getTodayDate={getTodayDate}
          />
        )}
      </div>

      {/* --- Overlay Modals --- */}

      {/* A. Global History Modal (Reversing history array exactly like native openHistory) */}
      {historyPlayerId && historyPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card-bg rounded-lg p-5 w-full max-w-lg relative h-[85vh] flex flex-col border border-theme">
            <button
              onClick={() => setHistoryPlayerId(null)}
              className="absolute top-4 left-4 text-muted hover:text-main input-bg p-1 rounded-full border border-theme"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
            <h3 className="text-xl font-bold text-primary mb-1 glow-text">سجل اللاعب</h3>
            <p className="text-primary-light mb-4 text-sm font-bold">
              [#{historyPlayer.number}] {historyPlayer.name}
            </p>
            
            <div className="flex border-b border-theme mb-4">
              <button
                onClick={() => setHistoryTab('payments')}
                className={`w-1/2 py-2 text-center text-sm font-bold transition-all rounded-t-lg ${
                  historyTab === 'payments' ? 'tab-active' : 'tab-inactive'
                }`}
              >
                المدفوعات
              </button>
              <button
                onClick={() => setHistoryTab('calendar')}
                className={`w-1/2 py-2 text-center text-sm font-bold transition-all rounded-t-lg ${
                  historyTab === 'calendar' ? 'tab-active' : 'tab-inactive'
                }`}
              >
                أيام الحضور 📅
              </button>
            </div>

            {/* Payments Sub tab logs */}
            {historyTab === 'payments' && (
              <div className="overflow-y-auto pr-1 flex-1 space-y-3 block">
                {!historyPlayer.history || historyPlayer.history.length === 0 ? (
                  <div className="text-center text-muted py-6 border border-dashed border-theme rounded-lg">
                    لا يوجد سجل مدفوعات سابق للاعب.
                  </div>
                ) : (
                  [...historyPlayer.history].reverse().map(h => (
                    <div
                      key={h.timestamp}
                      className="input-bg rounded-lg p-3 text-right shadow-sm border border-theme relative mb-3"
                    >
                      <button
                        onClick={() => handleDeleteHistoryEntry(historyPlayer.id, h.timestamp)}
                        className="absolute top-3 left-3 text-danger hover:text-red-400 bg-danger/10 px-2 py-1 rounded text-xs transition-all border border-danger/20"
                      >
                        مسح 🗑️
                      </button>
                      <div className="flex justify-between items-center border-b border-theme pb-2 mb-2 pr-16">
                        <span className="text-primary font-bold bg-primary-glow px-2 py-1 rounded text-xs">
                          {h.subType}
                        </span>
                        <span className="text-muted text-xs flex items-center gap-1">
                          🕒 {new Date(h.date).toLocaleDateString('en-GB')}
                        </span>
                      </div>
                      
                      <div className="flex justify-between text-sm px-1">
                        <div>
                          <span className="text-muted text-xs block mb-1">المبلغ</span>
                          <span className="text-success font-bold">{h.paid} ج</span>
                        </div>
                        <div>
                          <span className="text-muted text-xs block mb-1">الجيم</span>
                          <span className="text-danger font-bold">{h.cost} ج</span>
                        </div>
                        <div>
                          <span className="text-muted text-xs block mb-1">الربح</span>
                          <span className="text-primary font-bold glow-text">{(h.paid || 0) - (h.cost || 0)} ج</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Calendar attendance tracker sub tab */}
            {historyTab === 'calendar' && (
              <div className="overflow-y-auto pr-1 flex-1">
                <div className="input-bg rounded-lg p-4 border border-theme">
                  <div className="text-center text-[10px] text-primary mb-3 glow-text font-bold">
                    💡 اضغط على أي يوم لتسجيل أو إلغاء الحضور للّاعب
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <button
                      onClick={() => {
                        const newD = new Date(calCurrentDate);
                        newD.setMonth(newD.getMonth() - 1);
                        setCalCurrentDate(newD);
                      }}
                      className="text-primary hover:text-primary-light bg-transparent px-3 py-1 rounded border border-theme"
                    >
                      ◀
                    </button>
                    <span className="text-primary-light font-bold text-base glow-text">
                      {calCurrentDate.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                      onClick={() => {
                        const newD = new Date(calCurrentDate);
                        newD.setMonth(newD.getMonth() + 1);
                        setCalCurrentDate(newD);
                      }}
                      className="text-primary hover:text-primary-light bg-transparent px-3 py-1 rounded border border-theme"
                    >
                      ▶
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted mb-2 font-bold">
                    <div>أحد</div><div>إثنين</div><div>ثلاثاء</div><div>أربعاء</div><div>خميس</div><div>جمعة</div><div>سبت</div>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {getCalendarDays()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* B. Player Delete Confirmation Modal */}
      {playerToDeleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card-bg rounded-lg p-6 w-full max-w-sm text-center border border-theme">
            <h3 className="text-xl font-bold text-danger mb-2">تحذير النظام!</h3>
            <p className="text-main mb-6">هل أنت متأكد من حذف هذا اللاعب تماماً من القاعدة؟</p>
            <div className="flex gap-3">
              <button
                onClick={handleDeletePlayer}
                className="w-1/2 bg-danger text-danger border border-danger font-bold rounded-md px-4 py-2"
              >
                تأكيد
              </button>
              <button
                onClick={() => setPlayerToDeleteId(null)}
                className="w-1/2 input-bg font-bold rounded-md px-4 py-2"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* C. General Reset Month Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card-bg rounded-lg p-6 w-full max-w-sm text-center border border-theme">
            <h3 className="text-xl font-bold text-danger mb-2">تأكيد تصفير الشهر!</h3>
            <p className="text-main mb-6">
              هل أنت متأكد من مسح جميع إيرادات وحضور الشهر الحالي لجميع اللاعبين؟ (لا يمكن التراجع عن هذا الإجراء)
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  handleResetMonth();
                  setShowResetConfirm(false);
                }}
                className="w-1/2 bg-danger text-danger border border-danger font-bold rounded-md px-4 py-2"
              >
                تأكيد
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="w-1/2 input-bg font-bold rounded-md px-4 py-2"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* D. Backup/Export JSON Code Modal */}
      {showBackupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card-bg rounded-lg p-5 w-full max-w-sm relative flex flex-col border border-theme">
            <button
              onClick={() => setShowBackupModal(false)}
              className="absolute top-4 left-4 text-muted hover:text-main input-bg p-1 rounded-full border border-theme"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
            <h3 className="text-lg font-bold text-blue-500 mb-2">حفظ النسخة الاحتياطية</h3>
            <p className="text-xs text-muted mb-4">يفضل استخدام (تنزيل ملف) والاحتفاظ به لحماية بياناتك بالكامل.</p>
            <textarea
              readOnly
              value={backupText}
              className="w-full h-24 input-bg rounded p-3 text-left text-xs mb-4 opacity-70"
              style={{ direction: 'ltr', resize: 'none' }}
            ></textarea>
            <div className="flex gap-2">
              <button
                onClick={handleCopyBackup}
                className="w-1/2 bg-blue-500/20 text-blue-400 font-bold rounded px-3 py-2 border border-blue-500/50 hover:bg-blue-500 hover:text-white transition-colors text-sm"
              >
                نسخ الكود 📋
              </button>
              <button
                onClick={handleDownloadBackupFile}
                className="w-1/2 bg-blue-500 text-white font-bold rounded px-3 py-2 shadow-lg text-sm"
              >
                تنزيل ملف 📁
              </button>
            </div>
          </div>
        </div>
      )}

      {/* E. Import JSON Code Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card-bg rounded-lg p-5 w-full max-w-sm relative flex flex-col border border-theme">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-4 left-4 text-muted hover:text-main input-bg p-1 rounded-full border border-theme"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
            <h3 className="text-lg font-bold text-green-500 mb-2">استرجاع البيانات</h3>
            <p className="text-xs text-muted mb-4">اختر ملف النسخة الاحتياطية الذي قمت بتنزيله، أو الصق الكود هنا.</p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="أو الصق الكود هنا..."
              className="w-full h-24 input-bg rounded p-3 text-left text-xs mb-4"
              style={{ direction: 'ltr', resize: 'none' }}
            ></textarea>
            
            <input
              type="file"
              id="importFileInput"
              accept=".txt,.json"
              className="hidden"
              onChange={handleFileUpload}
            />
            
            <div className="flex gap-2">
              <button
                onClick={handleExecuteImport}
                className="w-1/2 bg-green-500/20 text-green-400 font-bold rounded px-3 py-2 border border-green-500/50 hover:bg-green-500 hover:text-white transition-colors text-sm"
              >
                لصق واسترجاع 🔄
              </button>
              <button
                onClick={() => document.getElementById('importFileInput')?.click()}
                className="w-1/2 bg-green-500 text-white font-bold rounded px-3 py-2 shadow-lg text-sm"
              >
                رفع الملف 📁
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Floating Toast Notification Alert --- */}
      <div
        className={`fixed bottom-5 left-1/2 transform -translate-x-1/2 w-[90%] max-w-sm text-center py-3 px-4 rounded-md z-50 border transition-all duration-300 ${
          showToast ? 'toast-active block' : 'toast-enter hidden'
        } ${
          toastIsError
            ? 'bg-danger text-white border-danger shadow-[0_0_15px_rgba(239,68,68,0.5)] font-bold'
            : 'card-bg text-primary-light border-theme shadow-[0_0_15px_var(--primary-glow)] font-bold'
        }`}
      >
        <span>{toastMessage}</span>
      </div>
    </div>
  );
};
export default App;
