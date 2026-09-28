import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const ThemeToggle = () => {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
};
