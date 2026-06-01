import React, { useEffect, useState } from 'react';

interface HeaderProps {
  theme: string;
  setTheme: (theme: string) => void;
  mode: string;
  setMode: (mode: string) => void;
  syncStatus: 'online' | 'offline' | 'syncing';
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  setTheme,
  mode,
  setMode,
  syncStatus,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA installation outcome: ${outcome}`);
    setDeferredPrompt(null);
  };

  const toggleMode = () => {
    setMode(mode === 'light' ? 'dark' : 'light');
  };

  const getSyncStatusBadge = () => {
    switch (syncStatus) {
      case 'online':
        return (
          <span className="text-success text-[10px] bg-success/20 px-2 py-0.5 rounded-full border border-success transition-all whitespace-nowrap">
            ☁️ متصل (Supabase)
          </span>
        );
      case 'offline':
        return (
          <span className="text-danger text-[10px] bg-danger/20 px-2 py-0.5 rounded-full border border-danger transition-all whitespace-nowrap">
            ☁️ أوفلاين
          </span>
        );
      case 'syncing':
        return (
          <span className="text-primary-light text-[10px] bg-primary/20 px-2 py-0.5 rounded-full border border-primary transition-all animate-pulse whitespace-nowrap">
            ☁️ جاري المزامنة...
          </span>
        );
    }
  };

  return (
    <div className="flex justify-between items-center px-4 pt-4 pb-2">
      {/* Theme Selectors */}
      <div className="flex gap-1 input-bg p-1 rounded-full border border-theme">
        <button
          onClick={() => setTheme('solo')}
          className={`theme-icon p-1 rounded-full border border-transparent ${theme === 'solo' ? 'active' : ''}`}
          id="btn-solo"
          title="Solo Leveling"
        >
          🌌
        </button>
        <button
          onClick={() => setTheme('haikyuu')}
          className={`theme-icon p-1 rounded-full border border-transparent ${theme === 'haikyuu' ? 'active' : ''}`}
          id="btn-haikyuu"
          title="Haikyuu"
        >
          🏐
        </button>
        <button
          onClick={() => setTheme('naruto')}
          className={`theme-icon p-1 rounded-full border border-transparent ${theme === 'naruto' ? 'active' : ''}`}
          id="btn-naruto"
          title="Naruto"
        >
          🦊
        </button>
        <button
          onClick={() => setTheme('cyberpunk')}
          className={`theme-icon p-1 rounded-full border border-transparent ${theme === 'cyberpunk' ? 'active' : ''}`}
          id="btn-cyberpunk"
          title="Cyberpunk"
        >
          🦾
        </button>
        <button
          onClick={() => setTheme('dbz')}
          className={`theme-icon p-1 rounded-full border border-transparent ${theme === 'dbz' ? 'active' : ''}`}
          id="btn-dbz"
          title="Dragon Ball"
        >
          🐉
        </button>
      </div>

      {/* Sync and Actions */}
      <div className="flex gap-2 items-center">
        {getSyncStatusBadge()}
        {deferredPrompt && (
          <button
            onClick={handleInstallApp}
            className="px-3 py-1 bg-green-500/20 text-success font-bold rounded-full border border-success text-xs shadow-[0_0_8px_rgba(16,185,129,0.3)] transition-all active:scale-95"
          >
            تثبيت التطبيق 📱
          </button>
        )}
        <button
          onClick={toggleMode}
          className="p-2 rounded-full card-bg text-xl shadow-md transition-all active:scale-95 flex items-center justify-center"
        >
          {mode === 'light' ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  );
};
