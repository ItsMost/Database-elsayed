import React, { useState, useEffect, useRef } from 'react';
import type { Player, HistoryEntry, ExpectedAttendee } from '../types';

interface ActiveSectionProps {
  players: Player[];
  selectedPlayerId: string;
  setSelectedPlayerId: (id: string) => void;
  onSaveSubscription: (
    playerId: string,
    subData: { subType: string; startDate: string; paid: number; cost: number },
    isEdit?: boolean
  ) => Promise<void>;
  onCancelSubscription: (playerId: string) => Promise<void>;
  checkExpiration: (player: Player) => { isExpired: boolean; days: number; endDateStr: string };
  onAddAttendance: (playerId: string, dateStr: string) => Promise<void>;
  onRemoveAttendance: (playerId: string, dateStr: string) => Promise<void>;
  getTodayDate: () => string;
  searchQuery: string;
  sportFilter: string;
  dateFilter: string;
  expectedAttendees: ExpectedAttendee[];
  onAddExpectedAttendee: (attendee: Omit<ExpectedAttendee, 'id'>) => Promise<void>;
  onDeleteExpectedAttendee: (id: number) => Promise<void>;
  onApplyExpectedAttendee: (attendee: ExpectedAttendee) => Promise<void>;
  allSports: string[];
}

export const ActiveSection: React.FC<ActiveSectionProps> = ({
  players,
  selectedPlayerId,
  setSelectedPlayerId,
  onSaveSubscription,
  onCancelSubscription,
  checkExpiration,
  onAddAttendance,
  onRemoveAttendance,
  getTodayDate,
  searchQuery,
  sportFilter,
  dateFilter,
  expectedAttendees,
  onAddExpectedAttendee,
  onDeleteExpectedAttendee,
  onApplyExpectedAttendee,
  allSports,
}) => {
  // Subscription Form states
  const [subType, setSubType] = useState('حصة واحدة');
  const [startDate, setStartDate] = useState(getTodayDate());
  const [paid, setPaid] = useState('');
  const [cost, setCost] = useState(60);
  const [editingMode, setEditingMode] = useState<string | null>(null); // PlayerId if editing current active sub

  // Custom attendance date state per player
  const [attDates, setAttDates] = useState<{ [playerId: string]: string }>({});

  // Searchable player dropdown states
  const [playerSearch, setPlayerSearch] = useState('');
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Expected Today form states
  const [expName, setExpName] = useState('');
  const [selectedExpPlayerId, setSelectedExpPlayerId] = useState('');
  const [showDailyArchive, setShowDailyArchive] = useState(false);
  const [expSport, setExpSport] = useState('');
  const [expPaid, setExpPaid] = useState('');
  const [expSubType, setExpSubType] = useState('حصة واحدة');
  const [expTime, setExpTime] = useState('');
  const [showExpDropdown, setShowExpDropdown] = useState(false);
  const expDropdownRef = useRef<HTMLDivElement>(null);

  // Handle clicking outside the searchable dropdowns to close them
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPlayerDropdown(false);
      }
      if (expDropdownRef.current && !expDropdownRef.current.contains(event.target as Node)) {
        setShowExpDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync playerSearch when selectedPlayerId changes
  useEffect(() => {
    if (selectedPlayerId) {
      const player = players.find(p => p.id === selectedPlayerId);
      if (player) {
        setPlayerSearch(`[#${player.number || '000'}] ${player.name}`);
      }
    } else {
      setPlayerSearch('');
    }
  }, [selectedPlayerId, players]);

  // Auto-calculate subscription cost based on rules
  useEffect(() => {
    const rawPaid = parseFloat(paid) || 0;
    if (subType === 'حصة واحدة') {
      setCost(60);
    } else {
      let sessions = 0;
      if (subType === '8 حصص') sessions = 8;
      else if (subType === '12 حصة') sessions = 12;
      else if (subType === '16 حصة') sessions = 16;
      else if (subType === '20 حصة') sessions = 20;

      if (rawPaid >= 1500) {
        if (sessions === 8) setCost(800);
        else if (sessions === 12) setCost(900);
        else if (sessions === 16) setCost(1000);
        else if (sessions === 20) setCost(1100);
      } else {
        setCost(sessions * 60);
      }
    }
  }, [subType, paid]);

  // Pre-fill if a player is selected via Roster "+ دفع" or if we are editing
  useEffect(() => {
    if (selectedPlayerId) {
      const player = players.find(p => p.id === selectedPlayerId);
      if (player && player.subType && editingMode === player.id) {
        setSubType(player.subType);
        setStartDate(player.startDate || getTodayDate());
        setPaid(player.paid ? String(player.paid) : '');
        setCost(player.cost ? player.cost : 60);
      } else {
        // Just standard "+ دفع" from roster card
        setStartDate(getTodayDate());
        setPaid('');
        setSubType('حصة واحدة');
      }
    }
  }, [selectedPlayerId, editingMode]);

  const handleSubmitSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayerId) {
      alert("الرجاء اختيار لاعب أولاً!");
      return;
    }

    await onSaveSubscription(selectedPlayerId, {
      subType,
      startDate: startDate || getTodayDate(),
      paid: parseFloat(paid) || 0,
      cost: cost,
    }, !!editingMode);

    // Reset Form
    setSelectedPlayerId('');
    setPaid('');
    setSubType('حصة واحدة');
    setEditingMode(null);
  };

  const handleEditSubscription = (player: Player) => {
    setSelectedPlayerId(player.id);
    setEditingMode(player.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRenewSubscription = (player: Player) => {
    setSelectedPlayerId(player.id);
    setEditingMode(null);
    setStartDate(getTodayDate());
    setPaid('');
    setSubType(player.subType || '8 حصص');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCustomAttendanceChange = (playerId: string, dateStr: string) => {
    setAttDates(prev => ({ ...prev, [playerId]: dateStr }));
  };

  // Helper to calculate attendance statistics
  const getAttendanceStats = (player: Player) => {
    const maxSessions =
      player.subType === '8 حصص' ? 8 :
      player.subType === '12 حصة' ? 12 :
      player.subType === '16 حصة' ? 16 :
      player.subType === '20 حصة' ? 20 :
      player.subType === 'حصة واحدة' ? 1 : 0;

    let activeAttendances = 0;
    if (player.attendance && player.startDate) {
      activeAttendances = player.attendance.filter(d => d >= player.startDate!).length;
    }

    const percentage = maxSessions > 0 ? (activeAttendances / maxSessions) * 100 : 0;
    return {
      activeAttendances,
      maxSessions,
      percentage: Math.min(percentage, 100),
    };
  };

  // Filter players with active subscriptions
  const filteredSubscribers = players.filter(p => {
    if (!p || p.isSystem) return false;
    
    const nameNumStr = (p.name || '').toLowerCase() + (p.number ? p.number.toString() : '');
    const matchesSearch = nameNumStr.includes(searchQuery.toLowerCase());
    
    const pSport = p.sport || 'General';
    const matchesSport = sportFilter === 'All' || pSport === sportFilter;
    
    let matchesDate = true;
    if (dateFilter) {
      const hasHist = p.history && p.history.some(h => h.date === dateFilter);
      const hasAtt = p.attendance && p.attendance.includes(dateFilter);
      matchesDate = !!(hasHist || hasAtt);
    }
    
    return matchesSearch && matchesSport && matchesDate;
  });

  const monthlySubscribers = filteredSubscribers.filter(p => p.subType && p.subType !== 'حصة واحدة');
  const dailySubscribers = filteredSubscribers.filter(p => p.subType === 'حصة واحدة');

  // Expiration Alerts: Filter players whose subscription is expired
  const expiredPlayers = players.filter(p => {
    if (p.isSystem || !p.subType) return false;
    const exp = checkExpiration(p);
    return exp.isExpired;
  });

  const getHourlySummary = () => {
    const counts: { [hour: string]: number } = {};
    expectedAttendees.forEach(att => {
      if (att.time) {
        const hourStr = att.time.split(':')[0]; // e.g. "17"
        const hourNum = parseInt(hourStr);
        const ampm = hourNum >= 12 ? 'م' : 'ص';
        const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
        const displayHour = `${hour12}:00 ${ampm}`;
        counts[displayHour] = (counts[displayHour] || 0) + 1;
      } else {
        counts['غير محدد'] = (counts['غير محدد'] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([hour, count]) => `${count} لاعبين (${hour})`)
      .join(' | ');
  };

  const sortedExpected = [...expectedAttendees].sort((a, b) => {
    const timeA = a.time || '23:59';
    const timeB = b.time || '23:59';
    return timeA.localeCompare(timeB);
  });

  const handlePhoneFormat = (rawPhone?: string) => {
    if (!rawPhone || !rawPhone.trim()) return '';
    let formatted = rawPhone.trim().replace(/[\s-]/g, '');
    if (formatted.startsWith('0')) {
      formatted = '2' + formatted;
    } else if (!formatted.startsWith('20') && !formatted.startsWith('+')) {
      formatted = '20' + formatted;
    }
    return formatted.replace('+', '');
  };

  const getWhatsAppLink = (player: Player) => {
    const formattedPhone = handlePhoneFormat(player.phone);
    if (!formattedPhone) return null;
    const msg = `أعتذر جداً بس النهاردة كانت آخر حصة في الشهر للاعب [#${player.number || '000'}] ${player.name} لتجديد الاشتراك برجاء التوجه لفرع النادي.`;
    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="space-y-6">
      {/* 1. Expiration Alerts Panel */}
      {expiredPlayers.length > 0 && (
        <div className="card-bg rounded-lg p-4 border border-danger/40 bg-danger/5 shadow-[0_0_15px_rgba(239,68,68,0.15)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-danger animate-pulse"></div>
          <h3 className="text-sm font-bold text-danger mb-3 flex items-center gap-1.5 glow-text pr-2">
            ⚠️ تنبيهات الاشتراكات المنتهية ({expiredPlayers.length})
          </h3>
          <div className="max-h-40 overflow-y-auto pr-1 space-y-2">
            {expiredPlayers.map(p => {
              const exp = checkExpiration(p);
              const waLink = getWhatsAppLink(p);
              return (
                <div key={p.id} className="input-bg rounded p-2 flex justify-between items-center border border-danger/10 text-xs hover:border-danger/30 transition-all">
                  <div className="text-right">
                    <span className="font-bold text-main block text-xs">[#{p.number || '000'}] {p.name}</span>
                    <span className="text-danger font-semibold mt-0.5 inline-block text-[10px]">منتهي من {exp.days} أيام ({p.subType})</span>
                  </div>
                  {waLink && (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-danger/20 hover:bg-danger text-danger hover:text-white px-2 py-1.5 rounded border border-danger/30 hover:border-danger/60 transition-all flex items-center gap-1 font-bold shadow-sm whitespace-nowrap"
                    >
                      تذكير 💬
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Expected Today Panel */}
      <div className="card-bg rounded-lg p-5 border-t-2 border-primary relative">
        <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-1.5 glow-text pr-2">
          📋 المتوقع حضورهم اليوم ({expectedAttendees.length})
        </h2>
        <p className="text-xs text-muted mb-2 leading-relaxed pr-2">
          سجل اللاعبين المتوقع حضورهم اليوم لتسجيلهم الفعلي كلاعبين وتفعيل الدفع وتأكيد الحضور بضغطة واحدة.
        </p>

        {/* Hourly summary displays here if expected attendees exist */}
        {expectedAttendees.length > 0 && (
          <div className="text-[10px] sm:text-xs text-primary-light font-semibold bg-primary-glow/10 border border-theme/40 rounded px-3 py-2 text-center mb-4 dir-rtl leading-relaxed">
            📢 {getHourlySummary()}
          </div>
        )}

        {/* Expected Today Form */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!expName.trim()) {
              alert("الرجاء اختيار لاعب من القائمة!");
              return;
            }

            // Enforce choosing a registered player
            const match = players.find(
              p => !p.isSystem && (p.id === selectedExpPlayerId || p.name.trim().toLowerCase() === expName.trim().toLowerCase())
            );

            if (!match) {
              alert("⚠️ لا يمكن إضافة اسم غير مسجل! الرجاء كتابة اسم لاعب مسجل واختياره من القائمة بالقاعدة.");
              return;
            }

            await onAddExpectedAttendee({
              name: match.name,
              playerId: match.id,
              sport: expSport.trim() || match.sport || 'General',
              paid: parseFloat(expPaid) || 0,
              subType: expSubType,
              date: getTodayDate(),
              time: expTime,
            });
            setExpName('');
            setSelectedExpPlayerId('');
            setExpPaid('');
            setExpSport('');
            setExpTime('');
          }}
          className="space-y-3 border-b border-theme/30 pb-4 mb-4"
        >
          {/* Searchable Dropdown for Expected Player Name */}
          <div className="relative w-full text-right" ref={expDropdownRef}>
            <input
              type="text"
              value={expName}
              onFocus={() => setShowExpDropdown(true)}
              onChange={(e) => {
                setExpName(e.target.value);
                setShowExpDropdown(true);
                const match = players.find(p => !p.isSystem && p.name === e.target.value);
                if (match) {
                  setSelectedExpPlayerId(match.id);
                  setExpSport(match.sport || 'General');
                  if (match.subType) {
                    setExpSubType(match.subType);
                  }
                } else {
                  setSelectedExpPlayerId('');
                }
              }}
              placeholder="🔍 ابحث عن اسم اللاعب بالقاعدة لاختياره..."
              className="w-full input-bg rounded-md px-3 py-2 text-sm border border-theme text-right"
              dir="rtl"
            />
            {showExpDropdown && (
              <div className="absolute z-50 w-full max-h-48 overflow-y-auto input-bg border border-theme rounded-md shadow-lg mt-1 pr-1">
                {players
                  .filter(p => !p.isSystem)
                  .filter(p => {
                    const searchStr = `${p.name} ${p.number || ''}`.toLowerCase();
                    const typedText = expName.trim().toLowerCase();
                    return searchStr.includes(typedText);
                  })
                  .map(p => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setExpName(p.name);
                        setSelectedExpPlayerId(p.id);
                        setExpSport(p.sport || 'General');
                        if (p.subType) {
                          setExpSubType(p.subType);
                        }
                        setShowExpDropdown(false);
                      }}
                      className="cursor-pointer px-4 py-2 hover:bg-primary-glow/20 transition-all text-right text-xs border-b border-theme/20 last:border-0"
                    >
                      <span className="text-primary-light font-bold">[#{p.number || '---'}]</span>{' '}
                      <span className="text-main">{p.name}</span>
                      {p.sport && <span className="text-muted text-[10px] mr-2">({p.sport})</span>}
                    </div>
                  ))}
                {players.filter(p => !p.isSystem).filter(p => {
                  const searchStr = `${p.name} ${p.number || ''}`.toLowerCase();
                  const typedText = expName.trim().toLowerCase();
                  return searchStr.includes(typedText);
                }).length === 0 && (
                  <div className="text-muted text-xs text-center py-3">لا يوجد لاعب مطابق بالقاعدة.</div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={expSport}
              onChange={(e) => setExpSport(e.target.value)}
              placeholder="الرياضة (اكتب أو اختر)"
              list="expSportSuggestions"
              className="w-full input-bg rounded-md px-3 py-2 text-sm border border-theme text-right"
            />
            <datalist id="expSportSuggestions">
              {allSports.map((s, idx) => (
                <option key={idx} value={s} />
              ))}
            </datalist>

            <select
              value={expSubType}
              onChange={(e) => setExpSubType(e.target.value)}
              className="w-full input-bg rounded-md px-3 py-2 text-sm border border-theme"
            >
              <option value="حصة واحدة">حصة واحدة (دفع يومي)</option>
              <option value="8 حصص">8 حصص في الشهر</option>
              <option value="12 حصة">12 حصة في الشهر</option>
              <option value="16 حصة">16 حصة في الشهر</option>
              <option value="20 حصة">20 حصة في الشهر</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              value={expTime}
              onChange={(e) => setExpTime(e.target.value)}
              className="w-full input-bg rounded-md px-3 py-2 text-sm border border-theme text-right text-muted"
            />
            <input
              type="number"
              value={expPaid}
              onChange={(e) => setExpPaid(e.target.value)}
              placeholder="سيدفع كام؟"
              className="w-full input-bg rounded-md px-3 py-2 text-sm border border-theme text-right"
            />
          </div>

          <button
            type="submit"
            className="w-full btn-primary font-bold rounded-md text-xs py-3 shadow-md active:scale-95 transition-all"
          >
            + إضافة لقائمة المتوقع اليوم
          </button>
        </form>

        {/* Expected Today List */}
        <div className="max-h-60 overflow-y-auto pr-1 space-y-3">
          {expectedAttendees.length === 0 ? (
            <div className="text-xs text-muted text-center py-4 border border-dashed border-theme rounded">
              لا يوجد لاعبين متوقع حضورهم مسجلين اليوم.
            </div>
          ) : (
            sortedExpected.map(att => {
              const displayTime = (() => {
                if (!att.time) return '';
                const [hStr, mStr] = att.time.split(':');
                const hourNum = parseInt(hStr, 10);
                const ampm = hourNum >= 12 ? 'م' : 'ص';
                const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
                return `${hour12}:${mStr || '00'} ${ampm}`;
              })();

              return (
                <div
                  key={att.id}
                  className="input-bg rounded-lg p-3 border border-theme/60 flex flex-col gap-2 shadow-sm"
                >
                  <div className="flex justify-between items-center border-b border-theme/20 pb-2">
                    <span className="font-bold text-primary-light text-sm">{att.name}</span>
                    <div className="flex gap-2 items-center">
                      {att.time && (
                        <span className="text-[10px] text-primary-light font-bold bg-primary-glow/20 px-2 py-0.5 rounded">
                          🕒 {displayTime}
                        </span>
                      )}
                      <span className="text-[10px] text-muted">{att.date}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <span className="text-muted block text-[10px]">الرياضة</span>
                      <span className="text-main font-semibold">{att.sport}</span>
                    </div>
                    <div>
                      <span className="text-muted block text-[10px]">الاشتراك</span>
                      <span className="text-primary font-semibold">{att.subType}</span>
                    </div>
                    <div>
                      <span className="text-muted block text-[10px]">سيدفع</span>
                      <span className="text-success font-bold">{att.paid} ج</span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => onApplyExpectedAttendee(att)}
                      className="w-1/2 bg-success text-white text-[11px] font-bold py-1.5 rounded hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-0.5 border border-success/30 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                    >
                      <span>تسجيل 🟢</span>
                    </button>
                    <button
                      onClick={() => att.id !== undefined && onDeleteExpectedAttendee(att.id)}
                      className="w-1/2 bg-danger/10 text-danger text-[11px] font-semibold py-1.5 rounded hover:bg-danger hover:text-white active:scale-95 transition-all border border-danger/20"
                    >
                      إلغاء 🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Payment / Sub Form */}
      <div className="card-bg rounded-lg p-5 mb-6 border-t-2 border-theme">
        <h2 className="text-lg font-bold text-primary mb-4 flex items-center">
          <svg className="w-5 h-5 ml-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          {editingMode ? 'تعديل الاشتراك والدفع الحالي' : 'تسجيل اشتراك ودفع'}
        </h2>
        <form onSubmit={handleSubmitSub} className="space-y-3">
          {/* Searchable Dropdown for Player Selection */}
          <div className="relative w-full text-right" ref={dropdownRef}>
            <input
              type="text"
              value={playerSearch}
              onFocus={() => setShowPlayerDropdown(true)}
              onChange={(e) => {
                setPlayerSearch(e.target.value);
                setShowPlayerDropdown(true);
                // Clear selected player if they type something custom, to prevent saving with wrong ID
                const match = players.find(
                  p => `[#${p.number || '000'}] ${p.name}` === e.target.value
                );
                if (match) {
                  setSelectedPlayerId(match.id);
                } else {
                  setSelectedPlayerId('');
                }
              }}
              placeholder="🔍 ابحث عن اللاعب بالاسم أو الرقم لاختياره..."
              className="w-full input-bg rounded-md px-4 py-3 text-right text-sm"
              dir="rtl"
            />
            {showPlayerDropdown && (
              <div className="absolute z-50 w-full max-h-48 overflow-y-auto input-bg border border-theme rounded-md shadow-lg mt-1 pr-1">
                {players
                  .filter(p => !p.isSystem)
                  .filter(p => {
                    const searchStr = `${p.name} ${p.number || ''}`.toLowerCase();
                    // If user typed some search keyword, filter by it. Otherwise show all.
                    const typedText = playerSearch.includes(']')
                      ? playerSearch.split(']').slice(1).join(' ').trim().toLowerCase()
                      : playerSearch.trim().toLowerCase();
                    return searchStr.includes(typedText);
                  })
                  .map(p => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedPlayerId(p.id);
                        setPlayerSearch(`[#${p.number || '000'}] ${p.name}`);
                        setShowPlayerDropdown(false);
                        setEditingMode(null);
                      }}
                      className="cursor-pointer px-4 py-2 hover:bg-primary-glow/20 transition-all text-right text-sm border-b border-theme/20 last:border-0"
                    >
                      <span className="text-primary-light font-bold">[#{p.number || '---'}]</span>{' '}
                      <span className="text-main">{p.name}</span>
                    </div>
                  ))}
                {players.filter(p => !p.isSystem).filter(p => {
                  const searchStr = `${p.name} ${p.number || ''}`.toLowerCase();
                  const typedText = playerSearch.includes(']')
                    ? playerSearch.split(']').slice(1).join(' ').trim().toLowerCase()
                    : playerSearch.trim().toLowerCase();
                  return searchStr.includes(typedText);
                }).length === 0 && (
                  <div className="text-muted text-xs text-center py-3">لا يوجد لاعب مطابق.</div>
                )}
              </div>
            )}
          </div>

          <select
            value={subType}
            onChange={(e) => setSubType(e.target.value)}
            className="w-full input-bg rounded-md px-4 py-3"
          >
            <option value="حصة واحدة">حصة واحدة (دفع يومي)</option>
            <option value="8 حصص">8 حصص في الشهر</option>
            <option value="12 حصة">12 حصة في الشهر</option>
            <option value="16 حصة">16 حصة في الشهر</option>
            <option value="20 حصة">20 حصة في الشهر</option>
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full input-bg rounded-md px-4 py-3"
          />

          <div className="flex gap-3">
            <input
              type="number"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              placeholder="دفع كام؟"
              className="w-1/2 input-bg rounded-md px-4 py-3"
            />
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(parseFloat(e.target.value) || 0)}
              placeholder="التكلفة"
              className="w-1/2 input-bg rounded-md px-4 py-3 text-success font-bold"
            />
          </div>

          <button
            type="submit"
            className="w-full btn-primary font-bold rounded-md px-4 py-3 active:scale-95 transition-all"
          >
            {editingMode ? 'حفظ تعديلات الاشتراك ✏️' : 'تأكيد الدفع (ACCEPT)'}
          </button>
        </form>
      </div>

      {/* Monthly Subscriptions List */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-primary mb-3 border-b border-theme pb-2 flex items-center gap-1">
          <span>📅</span> الدفع بالشهر
        </h3>
        {monthlySubscribers.length === 0 ? (
          <div className="text-center text-muted py-6 border border-dashed border-theme rounded-lg">
            لا توجد اشتراكات شهرية مسجلة حالياً.
          </div>
        ) : (
          <div className="space-y-4">
            {monthlySubscribers.map(player => {
              const expInfo = checkExpiration(player);
              const { activeAttendances, maxSessions, percentage } = getAttendanceStats(player);
              const formattedStartDate = player.startDate
                ? new Date(player.startDate).toLocaleDateString('en-GB')
                : '-';
              const isExpired = expInfo.isExpired;
              
              const attDate = attDates[player.id] || getTodayDate();

              return (
                <div
                  key={player.id}
                  className={`card-bg rounded-lg p-4 relative overflow-hidden ${
                    isExpired ? 'border-danger opacity-90' : ''
                  }`}
                >
                  <div
                    className="absolute top-0 right-0 w-1 h-full"
                    style={{
                      backgroundColor: isExpired ? 'var(--color-danger)' : 'var(--primary-light)',
                    }}
                  ></div>
                  
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className={`font-bold ${isExpired ? 'text-danger' : 'text-primary glow-text'} text-md`}>
                        #{player.number} | {player.name}
                      </h4>
                      <div className="text-xs text-muted mt-1 flex gap-2 flex-wrap">
                        <span className="input-bg border border-theme px-2 py-1 rounded">
                          البداية: {formattedStartDate}
                        </span>
                        <span
                          className={`${
                            isExpired ? 'text-danger bg-danger/20 border-danger' : 'text-main input-bg border-theme'
                          } border px-2 py-1 rounded`}
                        >
                          النهاية: {expInfo.endDateStr}
                        </span>
                      </div>
                      {isExpired && (
                        <div className="mt-2 inline-block bg-danger/20 text-danger text-xs px-2 py-1 rounded border border-danger animate-pulse">
                          ⚠️ منتهي من {expInfo.days} أيام
                        </div>
                      )}
                    </div>
                    
                    <div className="text-right input-bg border border-theme p-2 rounded">
                      <div className="text-xs text-muted">
                        دفع: <span className="text-main font-bold">{player.paid} ج</span>
                      </div>
                      <div className="text-xs text-muted">
                        جيم: <span className="text-main">{player.cost} ج</span>
                      </div>
                      <div className="text-xs font-bold text-success mt-1">
                        مكسب: {((player.paid || 0) - (player.cost || 0))} ج
                      </div>
                    </div>
                  </div>

                  {/* Attendance Log Tracker */}
                  <div className="mt-3 pt-3 border-t border-theme">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-1">
                      <div className="text-xs text-muted">
                        الحضور: <span className="text-primary font-bold">{activeAttendances}</span> من {maxSessions}
                      </div>
                      <div className="flex gap-1 items-center w-full sm:w-auto">
                        <input
                          type="date"
                          value={attDate}
                          onChange={(e) => handleCustomAttendanceChange(player.id, e.target.value)}
                          className="input-bg text-[10px] py-1 px-1 rounded border border-theme w-24"
                        />
                        <button
                          onClick={() => onAddAttendance(player.id, attDate)}
                          className="btn-primary px-2 py-1 rounded text-[10px] whitespace-nowrap"
                        >
                          + تسجيل
                        </button>
                        <button
                          onClick={() => onRemoveAttendance(player.id, attDate)}
                          className="bg-danger/20 text-danger px-2 py-1 rounded text-[10px] border border-danger hover:bg-danger hover:text-white transition-all whitespace-nowrap"
                        >
                          - مسح
                        </button>
                      </div>
                    </div>
                    <div className="w-full input-bg rounded-full h-1.5 mt-2 relative overflow-hidden border border-theme">
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: 'var(--primary)',
                          boxShadow: '0 0 8px var(--primary-glow)',
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Renew, Edit, Cancel Sub actions */}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-theme">
                    <button
                      onClick={() => handleRenewSubscription(player)}
                      className="text-success hover:text-green-400 input-bg py-1.5 text-xs rounded border border-success/30 transition-colors flex justify-center items-center gap-1"
                    >
                      ♻️ تجديد
                    </button>
                    <button
                      onClick={() => handleEditSubscription(player)}
                      className="text-primary hover:text-primary-light input-bg py-1.5 text-xs rounded border border-theme transition-colors flex justify-center items-center gap-1"
                    >
                      ✏️ تعديل
                    </button>
                    <button
                      onClick={() => onCancelSubscription(player.id)}
                      className="text-danger hover:text-red-400 input-bg py-1.5 text-xs rounded border border-danger/30 transition-colors flex justify-center items-center gap-1"
                    >
                      ❌ إلغاء
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Collapsible Archive for Daily Sessions */}
      <div className="mt-6 border-t border-theme/30 pt-4">
        <button
          type="button"
          onClick={() => setShowDailyArchive(!showDailyArchive)}
          className="w-full flex justify-between items-center bg-primary/10 hover:bg-primary/20 text-primary-light border border-primary/30 rounded-lg px-4 py-3 text-sm font-bold transition-all shadow-sm"
        >
          <span className="flex items-center gap-2">
            <span>📦</span> أرشيف الحصص اليومية الفردية اليوم ({dailySubscribers.length})
          </span>
          <span>{showDailyArchive ? '🔼 إخفاء الأرشيف' : '🔽 عرض الأرشيف'}</span>
        </button>

        {showDailyArchive && (
          <div className="mt-4 space-y-3 transition-all duration-300">
            {dailySubscribers.length === 0 ? (
              <div className="text-center text-muted text-xs py-6 border border-dashed border-theme rounded-lg bg-black/10">
                لا توجد حصص فردية مسجلة اليوم.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {dailySubscribers.map(player => {
                  const expInfo = checkExpiration(player);
                  const formattedStartDate = player.startDate
                    ? new Date(player.startDate).toLocaleDateString('en-GB')
                    : '-';
                  const isExpired = expInfo.isExpired;

                  return (
                    <div
                      key={player.id}
                      className={`card-bg rounded-lg p-3 relative overflow-hidden border ${
                        isExpired ? 'border-danger opacity-90' : 'border-theme/40'
                      }`}
                    >
                      <div
                        className="absolute top-0 right-0 w-1 h-full"
                        style={{
                          backgroundColor: isExpired ? 'var(--color-danger)' : 'var(--primary-light)',
                        }}
                      ></div>
                      
                      <div className="flex justify-between items-start text-xs">
                        <div>
                          <h4 className={`font-bold ${isExpired ? 'text-danger' : 'text-primary-light'} text-xs`}>
                            #{player.number} | {player.name}
                          </h4>
                          <div className="text-[10px] text-muted mt-1">
                            تاريخ اليوم: {formattedStartDate}
                          </div>
                        </div>
                        
                        <div className="text-right bg-black/20 p-1.5 rounded border border-theme/30 text-[10px]">
                          <div>دفع: <span className="text-success font-bold">{player.paid} ج</span></div>
                          <div>جيم: <span className="text-main">{player.cost} ج</span></div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="grid grid-cols-3 gap-1 mt-2.5 pt-2 border-t border-theme/20 text-[10px]">
                        <button
                          onClick={() => handleRenewSubscription(player)}
                          className="text-success hover:text-green-400 input-bg py-1 rounded border border-success/20 transition-all text-center font-bold"
                        >
                          ♻️ حصة جديدة
                        </button>
                        <button
                          onClick={() => handleEditSubscription(player)}
                          className="text-primary hover:text-primary-light input-bg py-1 rounded border border-theme/20 transition-all text-center"
                        >
                          ✏️ تعديل
                        </button>
                        <button
                          onClick={() => onCancelSubscription(player.id)}
                          className="text-danger hover:text-red-400 input-bg py-1 rounded border border-danger/20 transition-all text-center"
                        >
                          ❌ إلغاء الحصة
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
};
