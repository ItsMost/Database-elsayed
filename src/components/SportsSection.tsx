import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import type { Player } from '../types';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

interface SportsSectionProps {
  players: Player[];
}

export const SportsSection: React.FC<SportsSectionProps> = ({ players }) => {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const sportsData: {
    [sportName: string]: { revenue: number; cost: number; profit: number; count: number };
  } = {};

  // Group financial data by sport for the current month
  players
    .filter(p => !p.isSystem)
    .forEach(p => {
      const sportName = p.sport || 'General';
      if (!sportsData[sportName]) {
        sportsData[sportName] = { revenue: 0, cost: 0, profit: 0, count: 0 };
      }
      
      if (p.history) {
        p.history.forEach(h => {
          const hDate = new Date(h.date);
          if (hDate.getMonth() === currentMonth && hDate.getFullYear() === currentYear) {
            sportsData[sportName].revenue += h.paid || 0;
            sportsData[sportName].cost += h.cost || 0;
            sportsData[sportName].profit += (h.paid || 0) - (h.cost || 0);
            sportsData[sportName].count++;
          }
        });
      }
    });

  const chartLabels: string[] = [];
  const chartValues: number[] = [];
  const chartColors = ['#3b82f6', '#f97316', '#10b981', '#ec4899', '#f59e0b', '#8b5cf6', '#ef4444'];
  const listItems: Array<{ sport: string; revenue: number; cost: number; profit: number; count: number; color: string }> = [];

  let colorIndex = 0;
  for (const sport in sportsData) {
    if (sportsData[sport].profit > 0 || sportsData[sport].count > 0) {
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

  return (
    <div className="space-y-6">
      <div className="card-bg rounded-lg p-5 mb-6 border-t-2 border-theme relative">
        <h2 className="text-lg font-bold text-primary mb-4 flex items-center glow-text">
          <svg className="w-5 h-5 ml-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
          </svg>
          أرباح الرياضات (الشهر الحالي)
        </h2>
        
        {/* Doughnut Chart */}
        <div className="w-full input-bg p-4 rounded-lg border border-theme mb-6 flex justify-center h-64 relative">
          {hasData ? (
            <Doughnut data={doughnutData} options={chartOptions} />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted text-xs h-full w-full">
              <span>📊 لا توجد بيانات أرباح مسجلة في هذا الشهر حتى الآن.</span>
              <span className="text-[10px] mt-1">سجل اشتراكات جديدة لعرض الرسم البياني.</span>
            </div>
          )}
        </div>

        {/* Detailed stats grid */}
        <div id="sportsStatsList" className="space-y-3">
          {listItems.map((item, idx) => (
            <div
              key={idx}
              className="input-bg rounded-lg p-3 flex justify-between items-center border border-theme transition-all duration-300 hover:scale-[1.01]"
              style={{ borderRight: `4px solid ${item.color}` }}
            >
              <div>
                <span className="font-bold text-main block text-sm">{item.sport}</span>
                <span className="text-[10px] text-muted block mt-1">
                  العدد المالي: <b className="text-primary-light">{item.count} عمليات</b>
                </span>
              </div>
              
              <div className="text-right text-xs space-y-1">
                <span className="text-muted block">
                  إيرادات: <b className="text-success">{item.revenue} ج</b>
                </span>
                <span className="text-muted block">
                  جيم: <b className="text-danger">{item.cost} ج</b>
                </span>
                <span className="text-primary-light font-bold block mt-1">
                  صافي الربح: <b className="text-base font-extrabold">{item.profit} ج</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
