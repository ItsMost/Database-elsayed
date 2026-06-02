import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import type { Player, HistoryEntry } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ProfileSectionProps {
  players: Player[];
  onSaveExpense: (desc: string, cost: number, date: string) => Promise<void>;
  onDeleteExpense: (timestamp: number) => Promise<void>;
  onExportCSV: () => void;
  onExportJSON: () => void;
  onImportJSON: () => void;
  onDeepRecover: () => Promise<void>;
  getTodayDate: () => string;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({
  players,
  onSaveExpense,
  onDeleteExpense,
  onExportCSV,
  onExportJSON,
  onImportJSON,
  onDeepRecover,
  getTodayDate,
}) => {
  // Expense Form state
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(getTodayDate());

  // Profile Tab state: 'monthly' or 'daily'
  const [subTab, setSubTab] = useState<'monthly' | 'daily'>('monthly');
  const [dailyDateFilter, setDailyDateFilter] = useState('');

  // Daily transaction detail modal state
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [excludeMonthlyDays, setExcludeMonthlyDays] = useState<{[dayKey: string]: boolean}>({});

  // Month names in Arabic
  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  // --- Financial calculation logic (translating native JS renderProfile to React) ---
  const calculateFinancials = () => {
    const monthlyStats: {
      [monthKey: string]: {
        revenue: number;
        cost: number;
        profit: number;
        expenses: number;
        count: number;
        monthSubCount: number;
        totalAttendances: number;
        year: number;
        monthIndex: number;
      };
    } = {};

    const dailyStats: {
      [dayKey: string]: {
        revenue: number;
        cost: number;
        profit: number;
        expenses: number;
        paymentCount: number;
        totalAttendances: number;
        dateObj: Date;
        monthlyRevenue: number;
        dailyRevenue: number;
        monthlyCost: number;
        dailyCost: number;
        monthlyPaymentCount: number;
        dailyPaymentCount: number;
      };
    } = {};

    players.forEach(p => {
      if (p.isSystem) {
        if (p.history) {
          p.history.forEach(h => {
            const [y, m, d] = h.date.split('-');
            const monthKey = `${y}-${m}`;
            const hDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));

            if (!monthlyStats[monthKey]) {
              monthlyStats[monthKey] = {
                revenue: 0, cost: 0, profit: 0, expenses: 0, count: 0,
                monthSubCount: 0, totalAttendances: 0, year: parseInt(y), monthIndex: parseInt(m) - 1
              };
            }
            monthlyStats[monthKey].expenses += h.cost || 0;
            monthlyStats[monthKey].profit -= h.cost || 0;

            const dayKey = h.date;
            if (!dailyStats[dayKey]) {
              dailyStats[dayKey] = {
                revenue: 0, cost: 0, profit: 0, expenses: 0,
                paymentCount: 0, totalAttendances: 0, dateObj: hDate,
                monthlyRevenue: 0, dailyRevenue: 0,
                monthlyCost: 0, dailyCost: 0,
                monthlyPaymentCount: 0, dailyPaymentCount: 0
              };
            }
            dailyStats[dayKey].expenses += h.cost || 0;
            dailyStats[dayKey].profit -= h.cost || 0;
          });
        }
      } else {
        if (p.history) {
          p.history.forEach(h => {
            const [y, m, d] = h.date.split('-');
            const monthKey = `${y}-${m}`;
            const hDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));

            // 1. Monthly stats and overall treasury:
            if (!monthlyStats[monthKey]) {
              monthlyStats[monthKey] = {
                revenue: 0, cost: 0, profit: 0, expenses: 0, count: 0,
                monthSubCount: 0, totalAttendances: 0, year: parseInt(y), monthIndex: parseInt(m) - 1
              };
            }
            monthlyStats[monthKey].revenue += h.paid || 0;
            monthlyStats[monthKey].cost += h.cost || 0;
            monthlyStats[monthKey].profit += (h.paid || 0) - (h.cost || 0);
            monthlyStats[monthKey].count++;
            
            if (h.subType && h.subType !== 'حصة واحدة') {
              monthlyStats[monthKey].monthSubCount++;
            }

            // 2. Daily stats (History by day):
            const dayKey = h.date;
            if (!dailyStats[dayKey]) {
              dailyStats[dayKey] = {
                revenue: 0, cost: 0, profit: 0, expenses: 0,
                paymentCount: 0, totalAttendances: 0, dateObj: hDate,
                monthlyRevenue: 0, dailyRevenue: 0,
                monthlyCost: 0, dailyCost: 0,
                monthlyPaymentCount: 0, dailyPaymentCount: 0
              };
            }

            dailyStats[dayKey].revenue += h.paid || 0;
            dailyStats[dayKey].cost += h.cost || 0;
            dailyStats[dayKey].profit += (h.paid || 0) - (h.cost || 0);
            dailyStats[dayKey].paymentCount++;

            if (h.subType === 'حصة واحدة') {
              dailyStats[dayKey].dailyRevenue += h.paid || 0;
              dailyStats[dayKey].dailyCost += h.cost || 0;
              dailyStats[dayKey].dailyPaymentCount++;
            } else {
              dailyStats[dayKey].monthlyRevenue += h.paid || 0;
              dailyStats[dayKey].monthlyCost += h.cost || 0;
              dailyStats[dayKey].monthlyPaymentCount++;
            }
          });
        }

        if (p.attendance) {
          p.attendance.forEach(attDateStr => {
            if (!attDateStr) return;
            const [y, m, d] = attDateStr.split('-');
            const monthKey = `${y}-${m}`;
            const attDateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));

            if (!monthlyStats[monthKey]) {
              monthlyStats[monthKey] = {
                revenue: 0, cost: 0, profit: 0, expenses: 0, count: 0,
                monthSubCount: 0, totalAttendances: 0, year: parseInt(y), monthIndex: parseInt(m) - 1
              };
            }
            monthlyStats[monthKey].totalAttendances++;

            const dayKey = attDateStr;
            if (!dailyStats[dayKey]) {
              dailyStats[dayKey] = {
                revenue: 0, cost: 0, profit: 0, expenses: 0,
                paymentCount: 0, totalAttendances: 0, dateObj: attDateObj,
                monthlyRevenue: 0, dailyRevenue: 0,
                monthlyCost: 0, dailyCost: 0,
                monthlyPaymentCount: 0, dailyPaymentCount: 0
              };
            }
            dailyStats[dayKey].totalAttendances++;

            // Gym business logic: Charge 60 if attendance has no corresponding active monthly subscription OR paid daily session on this day
            let isMonthly = false;
            let hasPaidDailyToday = false;
            if (p.history) {
              // Check if they paid for a daily session today to avoid double-counting daily gym costs
              hasPaidDailyToday = p.history.some(h => h.date === attDateStr && h.subType === 'حصة واحدة');

              const pastHistories = p.history
                .filter(h => h.date <= attDateStr)
                .sort((a, b) => b.date.localeCompare(a.date));
              
              if (pastHistories.length > 0 && pastHistories[0].subType !== 'حصة واحدة') {
                // Check if attDateStr is within 1 month of the monthly subscription start date
                const startDate = new Date(pastHistories[0].date);
                const endDate = new Date(startDate);
                endDate.setMonth(endDate.getMonth() + 1);
                
                const attDate = new Date(attDateStr);
                if (attDate <= endDate) {
                  isMonthly = true;
                }
              }
            }

            if (!isMonthly && !hasPaidDailyToday) {
              dailyStats[dayKey].cost += 60;
              dailyStats[dayKey].dailyCost += 60; // Include in daily cost breakdown
              dailyStats[dayKey].profit -= 60;
              monthlyStats[monthKey].cost += 60;
              monthlyStats[monthKey].profit -= 60;
            }
          });
        }
      }
    });

    // 1. All-time Treasury Totals
    let allTimeRev = 0;
    let allTimeGymCost = 0;
    let allTimeExtExp = 0;

    for (const key in monthlyStats) {
      allTimeRev += monthlyStats[key].revenue;
      allTimeGymCost += monthlyStats[key].cost;
      allTimeExtExp += monthlyStats[key].expenses;
    }

    const totalOut = allTimeGymCost + allTimeExtExp;
    const netProfit = allTimeRev - totalOut;

    // 2. Sort keys chronologically
    const chronologicalKeys = Object.keys(monthlyStats).sort((a, b) => a.localeCompare(b));
    const reversedKeys = [...chronologicalKeys].reverse();

    const chronologicalDailyKeys = Object.keys(dailyStats).sort((a, b) => a.localeCompare(b));
    const reversedDailyKeys = [...chronologicalDailyKeys].reverse();

    return {
      allTimeRev,
      totalOut,
      netProfit,
      monthlyStats,
      dailyStats,
      chronologicalKeys,
      reversedKeys,
      chronologicalDailyKeys,
      reversedDailyKeys,
    };
  };

  const financials = calculateFinancials();

  // --- Expenses lists computed for current month ---
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const systemPlayer = players.find(p => p.isSystem);
  const currentMonthExpenses = systemPlayer?.history
    ? systemPlayer.history
        .filter(h => {
          const d = new Date(h.date);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .sort((a, b) => b.timestamp - a.timestamp)
    : [];

  const totalCurrentMonthExpenses = currentMonthExpenses.reduce((sum, h) => sum + (h.cost || 0), 0);

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expAmount);
    if (!expDesc.trim() || isNaN(amount) || amount <= 0) {
      alert("الرجاء إدخال اسم المصروف والمبلغ بشكل صحيح!");
      return;
    }

    await onSaveExpense(expDesc.trim(), amount, expDate || getTodayDate());
    setExpDesc('');
    setExpAmount('');
  };

  // --- Profit line chart configuration ---
  const chartLabels = financials.chronologicalKeys.map(
    key => `${monthNames[financials.monthlyStats[key].monthIndex]} ${financials.monthlyStats[key].year}`
  );
  
  const chartDataValues = financials.chronologicalKeys.map(
    key => financials.monthlyStats[key].profit
  );

  const lineChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'صافي الربح',
        data: chartDataValues,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderWidth: 2,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointRadius: 4,
        fill: true,
        tension: 0.3,
      },
    ],
  };

  const lineChartOptions = {
    responsive: true,
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(150, 150, 150, 0.05)' },
        ticks: { color: '#9ca3af', font: { family: 'Cairo', size: 10 } },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#9ca3af', font: { family: 'Cairo', size: 10 } },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        rtl: true,
        titleFont: { family: 'Cairo' },
        bodyFont: { family: 'Cairo' },
      },
    },
  };

  // --- Heatmap logic ---
  const getHeatmapGrid = () => {
    let maxProfitThisYear = 0;
    financials.chronologicalKeys.forEach(key => {
      const stat = financials.monthlyStats[key];
      if (stat.year === currentYear && stat.profit > maxProfitThisYear) {
        maxProfitThisYear = stat.profit;
      }
    });

    const cells = [];
    for (let i = 0; i < 12; i++) {
      const mKey = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
      const mStat = financials.monthlyStats[mKey];

      if (mStat && mStat.profit > 0) {
        const intensity = maxProfitThisYear > 0 ? mStat.profit / maxProfitThisYear : 0.5;
        const alpha = Math.max(0.3, intensity);
        cells.push(
          <div
            key={i}
            className="rounded p-2 flex flex-col justify-center items-center transition-all min-h-[60px]"
            style={{
              backgroundColor: `rgba(16, 185, 129, ${alpha})`,
              border: '1px solid rgba(16, 185, 129, 0.4)',
            }}
          >
            <span className="font-bold text-white text-[10px] drop-shadow-md">{monthNames[i]}</span>
            <span className="text-white font-bold text-xs drop-shadow-md mt-1">{mStat.profit} ج</span>
          </div>
        );
      } else {
        cells.push(
          <div
            key={i}
            className="input-bg rounded p-2 flex flex-col justify-center items-center opacity-50 border border-theme min-h-[60px]"
          >
            <span className="text-muted text-[10px]">{monthNames[i]}</span>
            <span className="text-muted text-xs mt-1">-</span>
          </div>
        );
      }
    }
    return cells;
  };

  // --- Daily Details Modal calculations ---
  const getDailyDetailsList = () => {
    if (!selectedDayKey) return null;
    const list: React.ReactNode[] = [];
    const showOnlyDaily = excludeMonthlyDays[selectedDayKey] || false;

    players.forEach(p => {
      if (p.isSystem) {
        p.history?.forEach(h => {
          if (h.date === selectedDayKey) {
            list.push(
              <div
                key={h.timestamp}
                className="input-bg rounded-lg p-3 text-right shadow-sm border border-orange-500/30 relative mb-3"
              >
                <button
                  onClick={() => {
                    onDeleteExpense(h.timestamp);
                    setSelectedDayKey(null); // Close modal after delete
                  }}
                  className="absolute top-3 left-3 text-danger hover:text-white bg-danger/10 hover:bg-danger px-2 py-1 rounded text-xs transition-all border border-danger/20"
                >
                  مسح 🗑️
                </button>
                <div className="border-b border-theme pb-2 mb-2 pr-28">
                  <div className="font-bold text-orange-400 text-sm">مصروف: {h.desc}</div>
                  <span className="text-orange-400 font-bold bg-orange-400/10 px-2 py-1 rounded text-[10px] mt-1 inline-block">
                    خصم من الخزينة
                  </span>
                </div>
                <div className="flex justify-between text-sm px-1">
                  <div>
                    <span className="text-muted text-xs block mb-1">قيمة المصروف</span>
                    <span className="text-danger font-bold">{h.cost} ج</span>
                  </div>
                </div>
              </div>
            );
          }
        });
      } else {
        p.history?.forEach(h => {
          if (h.date === selectedDayKey) {
            if (showOnlyDaily && h.subType !== 'حصة واحدة') {
              return;
            }
            const profit = (h.paid || 0) - (h.cost || 0);
            list.push(
              <div
                key={h.timestamp}
                className="input-bg rounded-lg p-3 text-right shadow-sm border border-theme relative mb-3"
              >
                <div className="border-b border-theme pb-2 mb-2">
                  <div className="font-bold text-primary text-sm">
                    اللاعب: <span className="text-primary-light">[#{p.number}] {p.name}</span>
                  </div>
                  <span className="text-primary font-bold bg-primary-glow px-2 py-0.5 rounded text-[10px] mt-1 inline-block">
                    {h.subType}
                  </span>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-xs text-center mt-2">
                  <div>
                    <span className="text-muted block">المبلغ المدفوع</span>
                    <span className="text-success font-bold text-sm">{h.paid} ج</span>
                  </div>
                  <div>
                    <span className="text-muted block">تكلفة الجيم</span>
                    <span className="text-danger font-bold text-sm">{h.cost} ج</span>
                  </div>
                  <div>
                    <span className="text-muted block">صافي الربح</span>
                    <span className="text-primary-light font-bold text-sm">{profit} ج</span>
                  </div>
                </div>
              </div>
            );
          }
        });
      }
    });

    if (list.length === 0) {
      return <div className="text-center text-muted py-6">لا توجد تفاصيل أو معاملات مسجلة في هذا اليوم.</div>;
    }
    return list;
  };

  const getFilteredDailyKeys = () => {
    if (dailyDateFilter) {
      return financials.reversedDailyKeys.includes(dailyDateFilter) ? [dailyDateFilter] : [];
    }
    return financials.reversedDailyKeys.slice(0, 5); // Default to last 5 active days
  };

  return (
    <div className="space-y-6">
      {/* 1. Historical Treasury Stats */}
      <div className="card-bg rounded-lg p-5 mb-6 border-t-2 border-primary relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-primary-glow rounded-full blur-3xl opacity-50"></div>
        <h2 className="text-lg font-bold text-primary mb-4 flex items-center glow-text relative z-10">
          👑 إجمالي الخزنة (كل الأوقات)
        </h2>
        <div className="grid grid-cols-2 gap-3 text-center relative z-10">
          <div className="input-bg p-3 rounded-lg border border-theme">
            <div className="text-[10px] text-muted mb-1">إجمالي الإيرادات</div>
            <div className="text-success font-bold text-base">{financials.allTimeRev} ج.م</div>
          </div>
          <div className="input-bg p-3 rounded-lg border border-theme">
            <div className="text-[10px] text-muted mb-1">إجمالي المصروفات</div>
            <div className="text-danger font-bold text-base">{financials.totalOut} ج.م</div>
          </div>
          <div className="col-span-2 bg-primary/10 p-4 rounded-lg border border-primary relative overflow-hidden shadow-[0_0_15px_rgba(59,130,246,0.2)] mt-1">
            <div className="text-xs text-primary-light mb-1 font-bold">صافي الربح التاريخي</div>
            <div className="text-primary-light font-bold text-3xl glow-text tracking-wider">
              {financials.netProfit} ج.م
            </div>
          </div>
        </div>
      </div>

      {/* 2. Backup & Excel Tools */}
      <div className="card-bg rounded-lg p-5 mb-6 border-t-2 border-blue-500 relative">
        <h2 className="text-lg font-bold text-blue-500 mb-4 flex items-center">
          💾 النسخ الاحتياطي وتصدير الداتا
        </h2>
        <p className="text-xs text-main mb-4 leading-relaxed">
          بسبب أن شاشة المعاينة المؤقتة تحذف البيانات، استخدم هذا القسم لنقل بياناتك بأمان.
        </p>
        <div className="flex gap-2 mb-3">
          <button
            onClick={onExportJSON}
            className="w-1/2 bg-blue-500/20 text-blue-400 border border-blue-500/50 py-2 rounded-lg font-bold hover:bg-blue-500 hover:text-white transition-all shadow-[0_0_10px_rgba(59,130,246,0.3)]"
          >
            نسخ (Export)
          </button>
          <button
            onClick={onImportJSON}
            className="w-1/2 bg-green-500/20 text-green-400 border border-green-500/50 py-2 rounded-lg font-bold hover:bg-green-500 hover:text-white transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)]"
          >
            لصق (Import)
          </button>
        </div>
        <button
          onClick={onExportCSV}
          className="w-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 py-3 rounded-lg font-bold hover:bg-emerald-500 hover:text-white transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)] flex justify-center items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          تصدير الداتا شيت إكسيل (Excel CSV)
        </button>
      </div>

      {/* 3. General Operational Expenses Form & Logs */}
      <div className="card-bg rounded-lg p-5 mb-6 border-t-2 border-orange-500 relative">
        <h2 className="text-lg font-bold text-orange-500 mb-4 flex items-center">
          💸 المصروفات الخارجية والتشغيل
        </h2>
        <form onSubmit={handleSubmitExpense} className="flex gap-2 mb-3">
          <input
            type="text"
            value={expDesc}
            onChange={(e) => setExpDesc(e.target.value)}
            placeholder="اسم المصروف (مثال: إعلانات)"
            className="w-1/2 input-bg rounded-md px-3 py-2 text-sm border border-theme"
          />
          <input
            type="number"
            value={expAmount}
            onChange={(e) => setExpAmount(e.target.value)}
            placeholder="المبلغ"
            className="w-1/4 input-bg rounded-md px-3 py-2 text-sm border border-theme"
          />
          <button
            type="submit"
            className="w-1/4 bg-orange-500/20 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/50 font-bold rounded-md text-sm shadow-md active:scale-95 transition-all"
          >
            إضافة
          </button>
        </form>
        <input
          type="date"
          value={expDate}
          onChange={(e) => setExpDate(e.target.value)}
          className="w-full input-bg rounded-md px-3 py-2 text-sm border border-theme mb-4 text-muted"
        />
        
        <div className="border-t border-theme/50 pt-3">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold text-primary">سجل مصروفات الشهر الحالي:</span>
            <span className="text-sm font-bold text-orange-400 bg-orange-400/10 px-2 py-1 rounded">
              {totalCurrentMonthExpenses} ج.م
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto pr-1 space-y-2">
            {currentMonthExpenses.length === 0 ? (
              <div className="text-xs text-muted text-center py-4 border border-dashed border-theme rounded">
                لا توجد مصروفات تشغيلية مسجلة هذا الشهر.
              </div>
            ) : (
              currentMonthExpenses.map(h => (
                <div
                  key={h.timestamp}
                  className="input-bg rounded p-2 flex justify-between items-center border border-orange-500/20 hover:border-orange-500/50 transition-colors"
                >
                  <div>
                    <span className="text-sm font-bold text-main block">{h.desc}</span>
                    <span className="text-[10px] text-muted">{h.date}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-orange-400 font-bold text-sm">{h.cost} ج</span>
                    <button
                      onClick={() => onDeleteExpense(h.timestamp)}
                      className="text-danger hover:text-white bg-danger/10 hover:bg-danger p-1.5 rounded text-xs transition-colors"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 4. Deep Database Scanning & Recovery */}
      <div className="card-bg rounded-lg p-5 mb-6 border-t-2 border-red-500 relative">
        <h2 className="text-lg font-bold text-red-500 mb-4 flex items-center">
          ⚙️ الفحص العميق للطوارئ (Deep Scan)
        </h2>
        <button
          onClick={onDeepRecover}
          className="w-full bg-red-500/20 text-red-400 border border-red-500/50 py-3 rounded-lg font-bold hover:bg-red-500 hover:text-white transition-all shadow-[0_0_10px_rgba(239,68,68,0.3)]"
        >
          بحث واسترجاع الداتا القديمة 🔄
        </button>
      </div>

      {/* 5. Profit Line Chart Graph */}
      <div className="card-bg rounded-lg p-5 mb-6 border-t-2 border-theme relative">
        <h2 className="text-lg font-bold text-primary mb-4 flex items-center glow-text">
          <svg className="w-5 h-5 ml-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>
          </svg>
          منحنى الأرباح والتحسن
        </h2>
        <div className="w-full input-bg p-2 rounded-lg border border-theme">
          {chartDataValues.length > 0 ? (
            <Line data={lineChartData} options={lineChartOptions} />
          ) : (
            <div className="text-center text-muted py-6">لا يوجد تقارير كافية لرسم المنحنى.</div>
          )}
        </div>
      </div>

      {/* 6. Calendar Heatmap */}
      <div className="card-bg rounded-lg p-5 mb-6 border-t-2 border-green-500 relative">
        <h2 className="text-lg font-bold text-green-500 mb-4 flex items-center">
          <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14v6m-3-3v3M8 9V7m-3 3v3m14-11a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14z"></path>
          </svg>
          الخريطة الحرارية لأرباح {currentYear} (Heatmap)
        </h2>
        <div id="heatmapGrid" className="grid grid-cols-4 gap-2 text-center text-xs">
          {getHeatmapGrid()}
        </div>
      </div>

      {/* 7. Comprehensive Monthly & Daily Financial Reports sub-tabs */}
      <div className="card-bg rounded-lg p-4 mb-6 border-t-2 border-theme relative">
        <h2 className="text-lg font-bold text-primary mb-4 flex items-center glow-text">
          <svg className="w-5 h-5 ml-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
          </svg>
          التقارير المالية والتحليل (History)
        </h2>
        <div className="flex border-b border-theme mb-4">
          <button
            onClick={() => setSubTab('monthly')}
            className={`w-1/2 py-2 text-center text-sm font-bold transition-all rounded-t-lg ${
              subTab === 'monthly' ? 'tab-active' : 'tab-inactive'
            }`}
          >
            بالشهر
          </button>
          <button
            onClick={() => setSubTab('daily')}
            className={`w-1/2 py-2 text-center text-sm font-bold transition-all rounded-t-lg ${
              subTab === 'daily' ? 'tab-active' : 'tab-inactive'
            }`}
          >
            باليوم
          </button>
        </div>

        {/* Monthly report lists */}
        {subTab === 'monthly' && (
          <div className="space-y-3">
            {financials.reversedKeys.length === 0 ? (
              <div className="text-center text-muted py-6 border border-dashed border-theme rounded-lg">
                لا يوجد تقارير شهرية حتى الآن.
              </div>
            ) : (
              financials.reversedKeys.map((key, index) => {
                const stat = financials.monthlyStats[key];
                const isCurrentMonth = index === 0;

                // Calculate percentage improvements
                const chronIdx = financials.chronologicalKeys.indexOf(key);
                const prevKey = chronIdx > 0 ? financials.chronologicalKeys[chronIdx - 1] : null;
                const prevStat = prevKey ? financials.monthlyStats[prevKey] : null;

                let percentChangeHtml = null;
                if (prevStat && prevStat.profit > 0) {
                  const change = ((stat.profit - prevStat.profit) / prevStat.profit) * 100;
                  if (change > 0) {
                    percentChangeHtml = (
                      <div className="text-success text-[10px] sm:text-xs font-bold mt-1 bg-success/20 px-2 py-1 rounded inline-block border border-success/30">
                        🔼 +{change.toFixed(1)}% تحسن
                      </div>
                    );
                  } else if (change < 0) {
                    percentChangeHtml = (
                      <div className="text-danger text-[10px] sm:text-xs font-bold mt-1 bg-danger/20 px-2 py-1 rounded inline-block border border-danger/30">
                        🔽 {Math.abs(change).toFixed(1)}% تراجع
                      </div>
                    );
                  } else {
                    percentChangeHtml = (
                      <div className="text-muted text-[10px] sm:text-xs font-bold mt-1 input-bg border border-theme px-2 py-1 rounded inline-block">
                        ➖ استقرار
                      </div>
                    );
                  }
                } else if (!prevStat) {
                  percentChangeHtml = (
                    <div className="text-primary text-[10px] sm:text-xs font-bold mt-1 bg-primary-glow px-2 py-1 rounded inline-block border border-theme">
                      🚀 البداية
                    </div>
                  );
                }

                return (
                  <div
                    key={key}
                    className={`card-bg rounded-lg p-4 relative ${
                      isCurrentMonth ? 'border-primary border-2 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : ''
                    }`}
                  >
                    {isCurrentMonth && <div className="absolute top-0 right-0 w-1 h-full bg-primary-light"></div>}
                    <div className="flex justify-between items-start mb-2 border-b border-theme/50 pb-2">
                      <div>
                        <span className="text-primary font-bold text-base sm:text-lg block">
                          {monthNames[stat.monthIndex]} {stat.year}
                        </span>
                        {percentChangeHtml}
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <span className="text-muted text-[10px] input-bg border border-theme px-2 py-0.5 rounded">
                          {stat.count} إجمالي العمليات
                        </span>
                        <span className="text-blue-400 text-[10px] input-bg border border-blue-900/40 px-2 py-0.5 rounded">
                          {stat.monthSubCount || 0} اشتراك شهري
                        </span>
                        <span className="text-primary-light text-[10px] font-bold input-bg border border-theme px-2 py-0.5 rounded">
                          {stat.totalAttendances || 0} حضور إجمالي
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-sm text-center mt-3">
                      <div>
                        <div className="text-muted text-[10px] sm:text-xs mb-1">الإيرادات</div>
                        <div className="text-success font-bold">{stat.revenue} ج</div>
                      </div>
                      <div>
                        <div className="text-muted text-[10px] sm:text-xs mb-1">الجيم</div>
                        <div className="text-danger font-bold">{stat.cost} ج</div>
                      </div>
                      <div>
                        <div className="text-muted text-[10px] sm:text-xs mb-1">مصروفات</div>
                        <div className="text-orange-400 font-bold">{stat.expenses || 0} ج</div>
                      </div>
                      <div>
                        <div className="text-primary font-bold text-[10px] sm:text-xs mb-1">الصافي</div>
                        <div className="text-primary-light font-bold glow-text text-sm sm:text-base">
                          {stat.profit} ج
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Daily report lists */}
        {subTab === 'daily' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xs text-muted w-full">آخر 5 أيام نشطة (اختر تاريخ لتفاصيل يوم محدد):</div>
            </div>
            
            <div className="flex items-center gap-2 mb-3">
              <input
                type="date"
                value={dailyDateFilter}
                onChange={(e) => setDailyDateFilter(e.target.value)}
                className="w-full input-bg rounded-lg px-3 py-2 text-sm border border-theme text-muted"
              />
              <button
                onClick={() => setDailyDateFilter('')}
                className="input-bg border border-theme text-primary px-3 py-2 rounded-lg text-xs hover:text-primary-light transition-colors whitespace-nowrap"
              >
                إلغاء الفلتر
              </button>
            </div>

            {getFilteredDailyKeys().length === 0 ? (
              <div className="text-center text-muted py-6 border border-dashed border-theme rounded-lg">
                لا توجد تقارير يومية مسجلة في هذا التاريخ.
              </div>
            ) : (
              getFilteredDailyKeys().map(key => {
                const stat = financials.dailyStats[key];
                const isToday = key === getTodayDate();

                const chronIdx = financials.chronologicalDailyKeys.indexOf(key);
                const prevKey = chronIdx > 0 ? financials.chronologicalDailyKeys[chronIdx - 1] : null;
                const prevStat = prevKey ? financials.dailyStats[prevKey] : null;

                let percentChangeHtml = null;
                if (prevStat && prevStat.profit > 0) {
                  const change = ((stat.profit - prevStat.profit) / prevStat.profit) * 100;
                  if (change > 0) {
                    percentChangeHtml = (
                      <span className="text-success text-[10px] font-bold bg-success/20 border border-success/30 px-1.5 py-0.5 rounded">
                        🔼 +{change.toFixed(1)}%
                      </span>
                    );
                  } else if (change < 0) {
                    percentChangeHtml = (
                      <span className="text-danger text-[10px] font-bold bg-danger/20 border border-danger/30 px-1.5 py-0.5 rounded">
                        🔽 {Math.abs(change).toFixed(1)}%
                      </span>
                    );
                  } else {
                    percentChangeHtml = <span className="text-muted text-[10px] font-bold">➖ 0%</span>;
                  }
                }

                const dateStr = stat.dateObj.toLocaleDateString('ar-EG', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                });

                const showOnlyDaily = excludeMonthlyDays[key] || false;
                const dispRevenue = showOnlyDaily ? stat.dailyRevenue : stat.revenue;
                const dispCost = showOnlyDaily ? stat.dailyCost : stat.cost;
                const dispExpenses = stat.expenses || 0;
                const dispProfit = showOnlyDaily ? (stat.dailyRevenue - stat.dailyCost - stat.expenses) : stat.profit;
                const dispPaymentCount = showOnlyDaily ? stat.dailyPaymentCount : stat.paymentCount;

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedDayKey(key)}
                    className={`input-bg rounded-lg p-3 relative cursor-pointer hover:border-primary-light hover:scale-[1.01] transition-all border ${
                      isToday
                        ? 'border-primary border-2 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                        : showOnlyDaily
                        ? 'border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.15)] bg-amber-950/5'
                        : 'border-theme'
                    }`}
                  >
                    {isToday && <div className="absolute top-0 right-0 w-1 h-full bg-primary-light"></div>}
                    
                    <div className="flex justify-between items-center border-b border-theme/50 pb-2 mb-2">
                      <span className="text-primary font-bold text-sm flex items-center gap-1">
                        {isToday ? 'اليوم ' : ''}
                        {dateStr}
                        <svg className="w-4 h-4 text-primary-light opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        </svg>
                      </span>
                      <div className="flex items-center gap-1.5">
                        {percentChangeHtml}
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Stop event propagation so clicking here doesn't open the daily details modal
                            setExcludeMonthlyDays(prev => ({
                              ...prev,
                              [key]: !prev[key]
                            }));
                          }}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all active:scale-95 whitespace-nowrap ${
                            showOnlyDaily
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30 shadow-[0_0_6px_rgba(245,158,11,0.2)]'
                              : 'bg-primary/20 text-primary-light border-primary/50 hover:bg-primary/30 shadow-[0_0_6px_rgba(59,130,246,0.2)]'
                          }`}
                        >
                          {showOnlyDaily ? 'حصص فقط 🎯' : 'الكل 🌐'}
                        </button>
                      </div>
                    </div>
                    
                    <div className="text-[11px] text-muted mb-2 text-center bg-black/20 rounded py-1 border border-theme/50">
                      <span className="text-success font-semibold">{dispPaymentCount} دفعات فردية</span> |{' '}
                      <span className="text-primary-light font-semibold">{stat.totalAttendances} حضور إجمالي</span>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-1 text-xs text-center">
                      <div>
                        <div className="text-muted mb-1 text-[10px]">إيرادات</div>
                        <div className="text-success font-bold">{dispRevenue} ج</div>
                        <div className="text-[8px] text-muted/80 mt-0.5 whitespace-nowrap">
                          {showOnlyDaily ? `حصص: ${stat.dailyRevenue}` : `شهري: ${stat.monthlyRevenue} | حصص: ${stat.dailyRevenue}`}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted mb-1 text-[10px]">جيم</div>
                        <div className="text-danger font-bold">{dispCost}</div>
                      </div>
                      <div>
                        <div className="text-muted mb-1 text-[10px]">مصروفات</div>
                        <div className="text-orange-400 font-bold">{dispExpenses}</div>
                      </div>
                      <div>
                        <div className="text-primary mb-1 text-[10px]">صافي</div>
                        <div className={`font-bold glow-text ${showOnlyDaily ? 'text-amber-400' : 'text-primary-light'}`}>
                          {dispProfit}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 8. Detailed Daily Statistics Modal */}
      {selectedDayKey && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="card-bg rounded-lg p-5 w-full max-w-lg relative h-[80vh] flex flex-col border border-theme">
            <button
              onClick={() => setSelectedDayKey(null)}
              className="absolute top-4 left-4 text-muted hover:text-main input-bg p-1 rounded-full border border-theme"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
            <h3 className="text-lg font-bold text-primary mb-4 glow-text pr-8">
              معاملات يوم: {new Date(selectedDayKey).toLocaleDateString('ar-EG', {
                weekday: 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </h3>
            
            <div className="overflow-y-auto pr-1 flex-1 space-y-3 block">
              {getDailyDetailsList()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
