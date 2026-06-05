import React, { useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import type { Player } from '../types';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

interface SportsSectionProps {
  players: Player[];
}

export const SportsSection: React.FC<SportsSectionProps> = ({ players }) => {
  // Month names in Arabic
  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  // 1. Generate unique month keys from data
  const uniqueMonths = new Set<string>();
  uniqueMonths.add(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  players.forEach(p => {
    p.history?.forEach(h => {
      if (h.date) {
        const [y, m] = h.date.split('-');
        uniqueMonths.add(`${y}-${m}`);
      }
    });
    p.attendance?.forEach(attDate => {
      if (attDate) {
        const [y, m] = attDate.split('-');
        uniqueMonths.add(`${y}-${m}`);
      }
    });
  });
  const sortedMonths = Array.from(uniqueMonths).sort().reverse();

  // States
  const [monthFilter, setMonthFilter] = useState(() => sortedMonths[0]);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [showDailyPlayers, setShowDailyPlayers] = useState(false);

  const [filterYear, filterMonth] = monthFilter.split('-').map(x => parseInt(x, 10));
  const currentMonth = filterMonth - 1;
  const currentYear = filterYear;

  // 2. Compute sports data and detailed players rosters
  const sportsData: {
    [sportName: string]: { revenue: number; cost: number; profit: number; count: number; totalAttendance: number };
  } = {};

  const sportDetails: {
    [sportName: string]: {
      dailyPlayers: Array<{ name: string; paidAmount: number; attendanceCount: number }>;
      monthlyPlayers: Array<{ name: string; paymentCount: number; paidAmount: number; attendanceCount: number }>;
      maxAttendance: number; // To find top attendee
    }
  } = {};

  let totalAttendanceAllSports = 0;

  players
    .filter(p => !p.isSystem)
    .forEach(p => {
      const sportName = p.sport || 'General';
      
      // Initialize stats
      if (!sportsData[sportName]) {
        sportsData[sportName] = { revenue: 0, cost: 0, profit: 0, count: 0, totalAttendance: 0 };
      }
      if (!sportDetails[sportName]) {
        sportDetails[sportName] = { dailyPlayers: [], monthlyPlayers: [], maxAttendance: 0 };
      }

      // Filter attendance in selected month
      const currentMonthAttendances = p.attendance
        ? p.attendance.filter(attDate => {
            const parts = attDate.split('-');
            if (parts.length < 2) return false;
            return parseInt(parts[0], 10) === currentYear && parseInt(parts[1], 10) === filterMonth;
          })
        : [];
      const attCount = currentMonthAttendances.length;
      sportsData[sportName].totalAttendance += attCount;
      totalAttendanceAllSports += attCount;

      // Filter history in selected month
      const currentMonthHistory = p.history
        ? p.history.filter(h => {
            const parts = h.date.split('-');
            if (parts.length < 2) return false;
            return parseInt(parts[0], 10) === currentYear && parseInt(parts[1], 10) === filterMonth;
          })
        : [];

      // Add financial totals
      currentMonthHistory.forEach(h => {
        sportsData[sportName].revenue += h.paid || 0;
        sportsData[sportName].cost += h.cost || 0;
        sportsData[sportName].profit += (h.paid || 0) - (h.cost || 0);
        sportsData[sportName].count++;
      });

      // Daily session payments gym cost additions (which are not in history but exist in attendance)
      p.attendance?.forEach(attDate => {
        const parts = attDate.split('-');
        if (parts.length < 2) return;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (y === currentYear && m === filterMonth) {
          let isMonthly = false;
          let hasPaidDailyToday = false;
          if (p.history) {
            hasPaidDailyToday = p.history.some(h => h.date === attDate && h.subType === 'حصة واحدة');
            const pastHistories = p.history
              .filter(h => h.date <= attDate)
              .sort((a, b) => b.date.localeCompare(a.date));
            if (pastHistories.length > 0 && pastHistories[0].subType !== 'حصة واحدة') {
              const start = new Date(pastHistories[0].date);
              const end = new Date(start);
              end.setMonth(end.getMonth() + 1);
              const att = new Date(attDate);
              if (att <= end) {
                isMonthly = true;
              }
            }
          }
          if (!isMonthly && !hasPaidDailyToday) {
            sportsData[sportName].cost += 60;
            sportsData[sportName].profit -= 60;
          }
        }
      });

      // Categorize player for roster details
      const hasDailyPayment = currentMonthHistory.some(h => h.subType === 'حصة واحدة');
      const hasMonthlyPayment = currentMonthHistory.some(h => h.subType && h.subType !== 'حصة واحدة');
      
      const isMonthlyPlayer = hasMonthlyPayment || (p.subType && p.subType !== 'حصة واحدة' && !hasDailyPayment);

      const paidAmount = currentMonthHistory.reduce((sum, h) => sum + (h.paid || 0), 0);

      if (isMonthlyPlayer) {
        const paymentCount = currentMonthHistory.filter(h => h.subType && h.subType !== 'حصة واحدة').length;
        if (paymentCount > 0 || attCount > 0) {
          sportDetails[sportName].monthlyPlayers.push({
            name: p.name,
            paymentCount,
            paidAmount,
            attendanceCount: attCount,
          });
          if (attCount > sportDetails[sportName].maxAttendance) {
            sportDetails[sportName].maxAttendance = attCount;
          }
        }
      } else {
        if (hasDailyPayment || attCount > 0) {
          sportDetails[sportName].dailyPlayers.push({
            name: p.name,
            paidAmount,
            attendanceCount: attCount,
          });
          if (attCount > sportDetails[sportName].maxAttendance) {
            sportDetails[sportName].maxAttendance = attCount;
          }
        }
      }
    });

  // Sort detailed players by attendance descending
  Object.keys(sportDetails).forEach(sportName => {
    sportDetails[sportName].dailyPlayers.sort((a, b) => b.attendanceCount - a.attendanceCount);
    sportDetails[sportName].monthlyPlayers.sort((a, b) => b.attendanceCount - a.attendanceCount);
  });

  const chartLabels: string[] = [];
  const chartValues: number[] = [];
  const chartColors = ['#3b82f6', '#f97316', '#10b981', '#ec4899', '#f59e0b', '#8b5cf6', '#ef4444'];
  const listItems: Array<{ sport: string; revenue: number; cost: number; profit: number; count: number; totalAttendance: number; color: string }> = [];

  let colorIndex = 0;
  for (const sport in sportsData) {
    if (sportsData[sport].profit > 0 || sportsData[sport].count > 0 || sportsData[sport].totalAttendance > 0) {
      chartLabels.push(sport);
      chartValues.push(Math.max(0, sportsData[sport].profit)); // Ensure no negative values in donut chart
      const color = chartColors[colorIndex % chartColors.length];
      colorIndex++;
      
      listItems.push({
        sport,
        ...sportsData[sport],
        color,
      });
    }
  }

  const hasData = chartValues.length > 0 && chartValues.some(val => val > 0);

  const doughnutData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'صافي الربح',
        data: chartValues,
        backgroundColor: listItems.map(item => item.color),
        borderColor: 'var(--bg-card)',
        borderWidth: 2,
        hoverOffset: 10,
      },
    ],
  };

  const isDarkMode = typeof document !== 'undefined' && document.body.getAttribute('data-mode') !== 'light';

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: isDarkMode ? '#e5e7eb' : '#1f2937',
          font: {
            family: 'Cairo',
            size: 11,
          },
        },
      },
      tooltip: {
        rtl: true,
        titleFont: { family: 'Cairo' },
        bodyFont: { family: 'Cairo' },
        callbacks: {
          label: (context: any) => {
            return ` صافي الربح: ${context.raw} ج.م`;
          },
        },
      },
    },
    cutout: '70%',
  };

  // CSV Export
  const handleExportSportCSV = (sportName: string) => {
    const details = sportDetails[sportName];
    if (!details) return;

    let csvContent = '\uFEFF'; // Excel UTF-8 BOM to support Arabic
    csvContent += "الاسم,نوع الحضور,عدد التجديدات هذا الشهر,عدد أيام الحضور هذا الشهر\n";

    details.monthlyPlayers.forEach(p => {
      csvContent += `${p.name.replace(/,/g, ' ')},اشتراك شهري,${p.paymentCount},${p.attendanceCount}\n`;
    });

    details.dailyPlayers.forEach(p => {
      csvContent += `${p.name.replace(/,/g, ' ')},بالحصة,-,${p.attendanceCount}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تقرير_لاعبين_${sportName}_${monthFilter}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top filter row */}
      <div className="card-bg rounded-lg p-4 flex flex-col sm:flex-row justify-between items-center gap-4 border border-theme select-none">
        <h2 className="text-base font-black text-primary flex items-center gap-1.5 glow-text">
          <span>📊 تحليلات وإحصائيات الرياضات</span>
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted">تصفية الشهر:</span>
          <select
            value={monthFilter}
            onChange={(e) => {
              setMonthFilter(e.target.value);
              setSelectedSport(null); // Reset detail view
              setShowDailyPlayers(false);
            }}
            className="input-bg rounded-md px-3 py-1.5 text-xs font-bold border border-theme"
          >
            {sortedMonths.map(mKey => {
              const [y, m] = mKey.split('-');
              return (
                <option key={mKey} value={mKey}>
                  {monthNames[parseInt(m) - 1]} {y}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="card-bg rounded-lg p-5 border-t-2 border-theme relative select-none">
        <h2 className="text-base font-black text-primary mb-4 flex items-center gap-1.5 glow-text">
          <svg className="w-5 h-5 ml-1 text-primary animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
          </svg>
          أرباح ونشاط الرياضات ({monthNames[currentMonth]} {currentYear})
        </h2>
        
        {/* Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Doughnut Chart (col-span-5) */}
          <div className="col-span-1 lg:col-span-5 w-full input-bg p-4 rounded-xl border border-theme flex justify-center h-64 relative">
            {hasData ? (
              <Doughnut data={doughnutData} options={chartOptions} />
            ) : (
              <div className="flex flex-col items-center justify-center text-muted text-xs h-full w-full">
                <span>📊 لا توجد بيانات أرباح مسجلة في هذا الشهر حتى الآن.</span>
                <span className="text-[10px] mt-1">سجل اشتراكات جديدة لعرض الرسم البياني.</span>
              </div>
            )}
          </div>

          {/* Detailed stats list (col-span-7) */}
          <div className="col-span-1 lg:col-span-7 space-y-3 w-full">
            {listItems.length === 0 ? (
              <div className="text-center text-xs text-muted py-12 font-bold bg-slate-50/50 dark:bg-slate-900/10 border border-dashed border-theme rounded-xl">
                لا توجد عمليات أو حضور مسجل في هذا الشهر للرياضات 📋
              </div>
            ) : (
              listItems.map((item, idx) => {
                const attPct = totalAttendanceAllSports > 0 
                  ? (item.totalAttendance / totalAttendanceAllSports) * 100 
                  : 0;
                const isSelected = selectedSport === item.sport;
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedSport(isSelected ? null : item.sport);
                      setShowDailyPlayers(false);
                    }}
                    className={`input-bg rounded-xl p-4 flex flex-col border transition-all duration-300 hover:scale-[1.01] cursor-pointer select-none ${
                      isSelected ? 'border-primary shadow-[0_0_12px_rgba(249,115,22,0.15)] bg-primary-glow/5' : 'border-theme'
                    }`}
                    style={{ borderRight: `5px solid ${item.color}` }}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-black text-main block text-sm">{item.sport}</span>
                        <span className="text-[10px] text-muted block mt-1">
                          العمليات المالية: <b className="text-primary-light">{item.count}</b> | إجمالي الحضور: <b className="text-primary-light">{item.totalAttendance} حضور</b>
                        </span>
                      </div>
                      
                      <div className="text-right text-xs space-y-0.5">
                        <span className="text-muted block text-[10px]">
                          إيرادات: <b className="text-success font-black">{item.revenue} ج</b> | جيم: <b className="text-danger font-black">{item.cost} ج</b>
                        </span>
                        <span className="text-primary-light font-black block text-xs mt-1">
                          صافي الربح: <b className="text-sm font-black glow-text">{item.profit} ج</b>
                        </span>
                      </div>
                    </div>

                    {/* Attendance share progress bar */}
                    <div className="mt-3 pt-2 border-t border-theme/20">
                      <div className="flex justify-between text-[9px] text-muted font-bold mb-1">
                        <span>نسبة الإقبال (مشاركة الحضور)</span>
                        <span className="text-primary-light">{attPct.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-900/60 h-1.5 rounded-full overflow-hidden border border-slate-200/40 dark:border-slate-800/40">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ 
                            width: `${attPct}%`, 
                            backgroundColor: item.color 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Roster details section (only displays if a sport is selected) */}
      {selectedSport && sportDetails[selectedSport] && (
        <div className="card-bg rounded-lg p-5 border border-theme select-none transition-all duration-500 animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-theme/30 pb-4 mb-5">
            <div>
              <h3 className="text-base font-black text-primary glow-text">
                📋 كشف لاعبي رياضة {selectedSport}
              </h3>
              <p className="text-[10px] text-muted font-bold mt-1">
                تصفية شهر: {monthNames[currentMonth]} {currentYear} | انقر فوق "تنزيل الكشف" لتصدير ملف Excel مصغر للمدربين
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center justify-center">
              <button
                onClick={() => setShowDailyPlayers(!showDailyPlayers)}
                className="bg-slate-100 dark:bg-slate-900 border border-theme text-xs font-black px-4 py-2 rounded-lg hover:border-primary transition-all flex items-center gap-1.5 text-main"
              >
                <span>{showDailyPlayers ? '🙈 إخفاء اللاعبين بالحصة' : '👁️ إظهار اللاعبين بالحصة'}</span>
              </button>
              <button
                onClick={() => handleExportSportCSV(selectedSport)}
                className="bg-primary/10 text-primary-light border border-primary/30 text-xs font-black px-4 py-2 rounded-lg hover:bg-primary hover:text-white transition-all flex items-center gap-1.5"
              >
                <span>📥 تنزيل الكشف (CSV)</span>
              </button>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${showDailyPlayers ? 'lg:grid-cols-2' : ''} gap-6 items-start`}>
            {/* 1. Monthly subscribers */}
            <div className="space-y-3">
              <div className="flex justify-between items-center border-b border-theme/20 pb-2 mb-3">
                <h4 className="text-xs font-black text-primary flex items-center gap-1">
                  <span>📅 المشتركون شهرياً (حزم اشتراك)</span>
                </h4>
                <span className="bg-primary/10 text-primary-light text-[9px] font-black px-2 py-0.5 rounded-full">
                  {sportDetails[selectedSport].monthlyPlayers.length} مشتركين
                </span>
              </div>

              {sportDetails[selectedSport].monthlyPlayers.length === 0 ? (
                <div className="text-center text-xs text-muted py-8 font-bold bg-slate-50/50 dark:bg-slate-900/10 border border-dashed border-theme rounded-xl">
                  لا يوجد لاعبين باشتراك شهري مسجلين هذا الشهر
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {sportDetails[selectedSport].monthlyPlayers.map((p, idx) => {
                    const isTop = p.attendanceCount > 0 && p.attendanceCount === sportDetails[selectedSport].maxAttendance;
                    return (
                      <div 
                        key={idx} 
                        className="flex justify-between items-center py-2.5 px-3.5 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 border border-theme hover:border-primary/20 hover:bg-primary-glow/5 transition-all"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-black text-main flex items-center gap-1.5">
                            {p.name}
                            {isTop && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-0.5 font-bold animate-pulse">
                                👑 الأكثر نشاطاً
                              </span>
                            )}
                          </span>
                          <div className="flex flex-wrap gap-2 mt-0.5">
                            <span className="text-[9px] text-muted font-bold">
                              التجديدات: <b className="text-primary-light">{p.paymentCount}</b>
                            </span>
                            <span className="text-[9px] text-muted font-bold">
                              | المدفوع هذا الشهر: <b className="text-success">{p.paidAmount} ج.م</b>
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-black text-success bg-success/10 border border-success/20 px-2.5 py-0.5 rounded-md">
                          حضر {p.attendanceCount} مرات
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Daily walk-in players */}
            {showDailyPlayers && (
              <div className="space-y-3 animate-fadeIn">
                <div className="flex justify-between items-center border-b border-theme/20 pb-2 mb-3">
                  <h4 className="text-xs font-black text-primary flex items-center gap-1">
                    <span>🚶 اللاعبون بالحصة (جلسات فردية)</span>
                  </h4>
                  <span className="bg-primary/10 text-primary-light text-[9px] font-black px-2 py-0.5 rounded-full">
                    {sportDetails[selectedSport].dailyPlayers.length} لاعبين
                  </span>
                </div>

                {sportDetails[selectedSport].dailyPlayers.length === 0 ? (
                  <div className="text-center text-xs text-muted py-8 font-bold bg-slate-50/50 dark:bg-slate-900/10 border border-dashed border-theme rounded-xl">
                    لا يوجد لاعبين مسجلين بالحصة هذا الشهر
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {sportDetails[selectedSport].dailyPlayers.map((p, idx) => {
                      const isTop = p.attendanceCount > 0 && p.attendanceCount === sportDetails[selectedSport].maxAttendance;
                      return (
                        <div 
                          key={idx} 
                          className="flex justify-between items-center py-2.5 px-3.5 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 border border-theme hover:border-primary/20 hover:bg-primary-glow/5 transition-all"
                        >
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-black text-main flex items-center gap-1.5">
                              {p.name}
                              {isTop && (
                                <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-0.5 font-bold animate-pulse">
                                  👑 الأكثر نشاطاً
                                </span>
                              )}
                            </span>
                            <span className="text-[9px] text-muted font-bold">
                              المدفوع هذا الشهر: <b className="text-success">{p.paidAmount} ج.م</b>
                            </span>
                          </div>
                          <span className="text-[10px] font-black text-success bg-success/10 border border-success/20 px-2.5 py-0.5 rounded-md">
                            حضر {p.attendanceCount} مرات
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
