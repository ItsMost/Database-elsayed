import React, { useState, useEffect } from 'react';
import type { Player } from '../types';

interface RosterSectionProps {
  players: Player[];
  searchQuery: string;
  sportFilter: string;
  dateFilter: string;
  onSavePlayer: (playerData: Omit<Player, 'attendance' | 'history'>) => Promise<void>;
  onEditSelect: (player: Player) => void;
  editingPlayer: Player | null;
  onDeletePlayer: (playerId: string) => void;
  onOpenPayment: (playerId: string) => void;
  onOpenHistory: (playerId: string) => void;
  checkExpiration: (player: Player) => { isExpired: boolean; days: number; endDateStr: string };
  allSports: string[];
}

export const RosterSection: React.FC<RosterSectionProps> = ({
  players,
  searchQuery,
  sportFilter,
  dateFilter,
  onSavePlayer,
  onEditSelect,
  editingPlayer,
  onDeletePlayer,
  onOpenPayment,
  onOpenHistory,
  checkExpiration,
  allSports,
}) => {
  // Get today's local year and month in YYYY-MM format
  const currentMonthPrefix = (() => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    const localDateStr = new Date(d.getTime() - offset).toISOString().split('T')[0];
    const parts = localDateStr.split('-');
    return `${parts[0]}-${parts[1]}`;
  })();

  // Form states
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [sport, setSport] = useState('');
  const [club, setClub] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [fat, setFat] = useState('');
  const [muscle, setMuscle] = useState('');
  
  const [formError, setFormError] = useState(false);

  // Sync form with editing player
  useEffect(() => {
    if (editingPlayer) {
      setName(editingPlayer.name || '');
      setNumber(editingPlayer.number || '');
      setBirthYear(editingPlayer.birthYear ? String(editingPlayer.birthYear) : '');
      setSport(editingPlayer.sport || '');
      setClub(editingPlayer.club || '');
      setPhone(editingPlayer.phone || '');
      setPosition(editingPlayer.position || '');
      setHeight(editingPlayer.height ? String(editingPlayer.height) : '');
      setWeight(editingPlayer.weight ? String(editingPlayer.weight) : '');
      setFat(editingPlayer.fat ? String(editingPlayer.fat) : '');
      setMuscle(editingPlayer.muscle ? String(editingPlayer.muscle) : '');
    } else {
      clearForm();
      setNextNumber();
    }
  }, [editingPlayer, players]);

  const setNextNumber = () => {
    if (editingPlayer) return;
    let maxNum = 0;
    players.filter(p => !p.isSystem && !p.isDeleted).forEach(p => {
      const num = parseInt(p.number || '0', 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    setNumber(String(maxNum + 1).padStart(3, '0'));
  };

  const clearForm = () => {
    setName('');
    setBirthYear('');
    setSport('');
    setClub('');
    setPhone('');
    setPosition('');
    setHeight('');
    setWeight('');
    setFat('');
    setMuscle('');
    setFormError(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError(true);
      return;
    }

    const playerData = {
      id: editingPlayer ? editingPlayer.id : String(Date.now() + Math.random()),
      number,
      name: name.trim(),
      birthYear: birthYear ? parseInt(birthYear) : '',
      sport: sport.trim(),
      club: club.trim(),
      phone: phone.trim(),
      position: position.trim(),
      height: height ? parseFloat(height) : '',
      weight: weight ? parseFloat(weight) : '',
      fat: fat ? parseFloat(fat) : '',
      muscle: muscle ? parseFloat(muscle) : '',
    };

    await onSavePlayer(playerData);
    clearForm();
  };

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

  const getWhatsAppLink = (player: Player, isExpired: boolean, days: number) => {
    const formattedPhone = handlePhoneFormat(player.phone);
    if (!formattedPhone) return null;

    if (isExpired) {
      const msg = `أعتذر جداً بس النهاردة كانت آخر حصة في الشهر للاعب [#${player.number}] ${player.name} لتجديد الاشتراك برجاء التوجه لفرع النادي.`;
      return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;
    }
    return `https://wa.me/${formattedPhone}`;
  };

  // Filtering players
  const filteredPlayers = players.filter(p => {
    if (!p || p.isSystem || p.isDeleted) return false;
    
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {/* Registration Form */}
      <div className="lg:col-span-1">
        <div className="card-bg rounded-lg p-5">
          <h2 className="text-lg font-bold text-primary mb-4 flex items-center glow-text">
            <svg className="w-5 h-5 ml-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
            </svg>
            {editingPlayer ? 'تعديل بيانات اللاعب' : 'تسجيل لاعب جديد'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFormError(false);
              }}
              placeholder="اسم اللاعب (مطلوب)"
              className={`w-full input-bg rounded-md px-4 py-3 transition-colors ${
                formError ? 'border-danger border-2 bg-danger/10' : ''
              }`}
            />
            
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="رقم اللاعب"
                className="w-full input-bg rounded-md px-3 py-3"
              />
              <input
                type="number"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                placeholder="سنة الميلاد"
                className="w-full input-bg rounded-md px-3 py-3"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                placeholder="الرياضة (اكتب أو اختر)"
                list="sportSuggestions"
                className="w-full input-bg rounded-md px-2 py-3 text-sm"
              />
              <datalist id="sportSuggestions">
                {allSports.map((s, idx) => (
                  <option key={idx} value={s} />
                ))}
              </datalist>
              
              <input
                type="text"
                value={club}
                onChange={(e) => setClub(e.target.value)}
                placeholder="النادي"
                className="w-full input-bg rounded-md px-3 py-3"
              />
            </div>

            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="رقم الموبايل (مهم للواتساب)"
              className="w-full input-bg rounded-md px-4 py-3"
              dir="auto"
            />

            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="المركز الذي يلعب فيه (مثل: صانع ألعاب)"
              className="w-full input-bg rounded-md px-4 py-3"
            />

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 btn-primary font-bold rounded-md px-4 py-3"
              >
                {editingPlayer ? 'حفظ التعديل' : 'إضافة للقاعدة'}
              </button>
              {editingPlayer && (
                <button
                  type="button"
                  onClick={clearForm}
                  className="input-bg border border-theme rounded-md px-4 py-3 font-bold text-sm"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Players List Section */}
      <div className="lg:col-span-2">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-primary glow-text">كل اللاعبين</h3>
          <span className="bg-primary text-white border border-theme text-xs font-bold px-3 py-1 rounded-full">
            {filteredPlayers.length}
          </span>
        </div>

        {/* Roster Cards List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredPlayers.map((player) => {
            const expInfo = checkExpiration(player);
            const currentYear = new Date().getFullYear();
            const ageStr = player.birthYear ? currentYear - parseInt(String(player.birthYear)) : '-';
            
            const isCardActive = !expInfo.isExpired && player.subType;
            const statusDot = isCardActive ? '🟢 اشتراك ساري' : '🔴 غير مسدد/منتهي';
            const statusColor = isCardActive ? 'text-success' : 'text-danger';
            
            const whatsappLink = getWhatsAppLink(player, expInfo.isExpired, expInfo.days);

            // Compute statistics
            const totalAttendance = player.attendance ? player.attendance.length : 0;
            const totalPaid = player.history ? player.history.reduce((sum, h) => sum + (h.paid || 0), 0) : 0;
            const monthPaymentsCount = player.history 
              ? player.history.filter(h => h.date && h.date.startsWith(currentMonthPrefix) && h.paid > 0).length 
              : 0;

            return (
              <div
                key={player.id}
                className={`card-bg rounded-lg p-4 relative ${
                  !isCardActive ? 'opacity-90 border-danger/50 border-2' : ''
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="w-full">
                    <h4 className="font-bold text-primary text-lg glow-text">
                      <span className="text-primary-light text-sm mr-1">#{player.number || '-'}</span>{' '}
                      {player.name}
                    </h4>
                    
                    <div className="text-xs text-muted mt-1">
                      المواليد: {player.birthYear || '-'} ({ageStr}) | الرياضة: {player.sport || '-'} | النادي: {player.club || '-'}
                    </div>

                    <div className="mt-2 text-xs grid grid-cols-2 gap-2 text-muted">
                      <div>
                        <span className="font-bold ml-1 text-primary">📱 الموبايل:</span>
                        <span className="text-main font-bold" dir="ltr">{player.phone || '-'}</span>
                      </div>
                      <div>
                        <span className="font-bold ml-1 text-primary">🏃 المركز:</span>
                        <span className="text-main font-bold">{player.position || '-'}</span>
                      </div>
                    </div>

                    <div className="mt-3 p-2 bg-slate-100 dark:bg-slate-900/40 rounded-xl grid grid-cols-3 gap-2 text-center border border-theme">
                      <div className="border-l border-theme/40 last:border-0 pl-1">
                        <span className="block text-[9px] text-muted font-black mb-0.5">حضور اللاعب</span>
                        <span className="text-xs font-black text-primary glow-text">
                          {totalAttendance} <span className="text-[9px] font-normal text-muted">مرات</span>
                        </span>
                      </div>
                      <div className="border-l border-theme/40 last:border-0 pl-1">
                        <span className="block text-[9px] text-muted font-black mb-0.5">إجمالي المدفوع</span>
                        <span className="text-xs font-black text-success">
                          {totalPaid} <span className="text-[9px] font-normal text-muted">ج.م</span>
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-muted font-black mb-0.5">دفعات الشهر</span>
                        <span className="text-xs font-black text-main">
                          {monthPaymentsCount} <span className="text-[9px] font-normal text-muted">مرات</span>
                        </span>
                      </div>
                    </div>

                    <div className={`text-xs mt-2 font-bold ${statusColor} mb-2`}>
                      {statusDot}
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      <button
                        onClick={() => onEditSelect(player)}
                        className="text-primary hover:text-primary-light input-bg py-1.5 text-xs rounded border border-theme transition-colors"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => onOpenPayment(player.id)}
                        className="text-success hover:text-green-400 input-bg py-1.5 text-xs rounded border border-success transition-colors"
                      >
                        + دفع
                      </button>
                      <button
                        onClick={() => onOpenHistory(player.id)}
                        className="text-main hover:text-primary-light input-bg py-1.5 text-xs rounded border border-theme transition-colors"
                      >
                        📜 السجل
                      </button>
                      <button
                        onClick={() => onDeletePlayer(player.id)}
                        className="text-danger hover:text-red-400 input-bg py-1.5 text-xs rounded border border-danger transition-colors"
                      >
                        مسح 🗑️
                      </button>
                    </div>

                    {whatsappLink && (
                      <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${
                          expInfo.isExpired
                            ? 'text-danger border-danger/30 hover:text-red-400'
                            : 'text-success border-success/30 hover:text-green-400'
                        } input-bg px-3 py-1.5 text-xs rounded border flex items-center justify-center gap-1 transition-all mt-1 w-full`}
                      >
                        <span>{expInfo.isExpired ? 'تذكير بالدفع' : 'مراسلة'}</span>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824z" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
