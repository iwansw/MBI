import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Wrench, 
  Users, 
  Settings, 
  LogOut, 
  PlusCircle, 
  Search,
  Bell,
  User as UserIcon,
  ChevronRight,
  Menu,
  X,
  CreditCard,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { User, UserRole } from './types';
import Dashboard from './components/Dashboard';
import ServiceRequestList from './components/ServiceRequestList';
import ServiceRequestForm from './components/ServiceRequestForm';
import TechnicianView from './components/TechnicianView';
import AdminPanel from './components/AdminPanel';
import BillingView from './components/BillingView';
import SettingsView from './components/SettingsView';
import ChangePassword from './components/ChangePassword';
import ProfileView from './components/ProfileView';
import { cn } from './lib/utils';
import Logo from './components/Logo';
import { db, OperationType, handleFirestoreError, auth } from './lib/firebase';
import { collection, onSnapshot, getDocs, query, where, limit, doc, getDoc, setDoc, addDoc } from 'firebase/firestore';

function Sidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const location = useLocation();
  
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: ['ADMIN', 'POWER_USER', 'MANAGER', 'OPERATOR', 'TECHNICIAN'] },
    { icon: ClipboardList, label: 'All Requests', path: '/requests', roles: ['ADMIN', 'POWER_USER', 'MANAGER', 'OPERATOR'] },
    { icon: PlusCircle, label: 'New Request', path: '/new-request', roles: ['ADMIN', 'OPERATOR'] },
    { icon: Wrench, label: 'My Jobs', path: '/my-jobs', roles: ['ADMIN', 'TECHNICIAN'] },
    { icon: CreditCard, label: 'Billing', path: '/billing', roles: ['ADMIN', 'POWER_USER', 'MANAGER', 'OPERATOR'] },
    { icon: Users, label: 'User Management', path: '/users', roles: ['ADMIN'] },
    { icon: Settings, label: 'Settings', path: '/settings', roles: ['ADMIN', 'POWER_USER'] },
    { icon: UserIcon, label: 'My Profile', path: '/profile', roles: ['ADMIN', 'POWER_USER', 'MANAGER', 'OPERATOR', 'TECHNICIAN'] },
  ];

  const filteredItems = menuItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="w-64 bg-zinc-900 text-zinc-400 h-screen flex flex-col border-r border-zinc-800 no-print">
      <div className="p-6 flex items-center gap-3">
        <Logo className="w-8 h-8" />
        <span className="text-white font-semibold text-lg tracking-tight">MBI Service</span>
      </div>
      
      <nav className="flex-1 px-4 py-4 space-y-1">
        {filteredItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group",
              location.pathname === item.path 
                ? "bg-zinc-800 text-white" 
                : "hover:bg-zinc-800/50 hover:text-zinc-200"
            )}
          >
            <item.icon className={cn("w-5 h-5", location.pathname === item.path ? "text-blue-500" : "group-hover:text-zinc-200")} />
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <Link to="/profile" className="flex items-center gap-3 px-3 py-2 mb-4 hover:bg-zinc-800/50 rounded-xl transition-all group">
          <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden ring-blue-500/20 group-hover:ring-4 transition-all">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-4 h-4 text-zinc-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{user.name}</p>
            <p className="text-[10px] text-zinc-500 truncate font-black uppercase tracking-widest mt-1 leading-none">{user.role}</p>
          </div>
        </Link>
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<any>({
    slideshow_images: '[]',
    app_version: 'v1.0.0',
    copyright_text: '© 2026 MBI Service Center'
  });
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'settings'), (snapshot) => {
      const data: any = {};
      snapshot.forEach(doc => {
        data[doc.id] = doc.data().value;
      });
      setSettings(prev => ({ ...prev, ...data }));
    });
    return () => unsubscribe();
  }, []);

  const images = useMemo(() => {
    try {
      return JSON.parse(settings.slideshow_images || '[]');
    } catch (err) {
      console.error('Failed to parse slideshow images:', err);
      return [];
    }
  }, [settings.slideshow_images]);

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [images.length]);

  const [isInitializing, setIsInitializing] = useState(false);

  const handleInitialize = async () => {
    setIsInitializing(true);
    try {
      // Create primary admin
      await setDoc(doc(db, 'users', 'admin'), {
        username: 'admin',
        password: 'admin123',
        role: 'ADMIN',
        name: 'System Administrator'
      });
      
      // Create default settings
      const defaultSettings = [
        { id: 'company_name', value: 'MBI Service Center' },
        { id: 'app_version', value: 'v2.4.0' },
        { id: 'copyright_text', value: '© 2026 MBI Service Center. All rights reserved.' },
        { id: 'announcement_text', value: 'Welcome to MBI Service Center! Project Initialized.' },
        { id: 'announcement_speed', value: '30' }
      ];
      
      for (const s of defaultSettings) {
        await setDoc(doc(db, 'settings', s.id), { value: s.value });
      }

      // Create some brands
      const brands = ['EPSON', 'Brother', 'ASUS', 'MSI', 'Lenovo'];
      for (const b of brands) {
        await addDoc(collection(db, 'brands'), { name: b });
      }

      toast.success('System initialized successfully! You can now login with admin / admin123');
      setError('');
    } catch (err) {
      console.error('Initialization failed:', err);
      toast.error('Initialization failed. Check console for details.');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const q = query(collection(db, 'users'), where('username', '==', username.trim()), limit(1));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setError('User not found');
        return;
      }

      const userData = snapshot.docs[0].data();
      if (userData.password === password) {
        const user: User = {
          id: snapshot.docs[0].id,
          username: userData.username,
          role: userData.role as UserRole,
          name: userData.name
        };
        onLogin(user);
        toast.success(`Welcome back, ${user.name}!`);
      } else {
        setError('Invalid password');
      }
    } catch (err) {
      setError('Connection error');
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col md:flex-row overflow-hidden font-sans">
      {/* Left Column: Login Section */}
      <div className="w-full md:w-[450px] lg:w-[500px] flex flex-col p-8 md:p-12 lg:p-16 relative z-10 bg-zinc-900 border-r border-zinc-800 shadow-2xl overflow-y-auto">
        <div className="mb-auto">
          <div className="flex items-center gap-3 mb-10">
            <Logo className="w-10 h-10" />
            <span className="text-white font-bold text-xl tracking-tight">MBI Service</span>
          </div>

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-2 mb-10"
          >
            <h1 className="text-4xl font-black text-white leading-tight">Welcome <span className="text-emerald-500">Back.</span></h1>
            <p className="text-zinc-500 text-lg">Log in to your service portal</p>
          </motion.div>
 
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-zinc-600"
                placeholder="Enter your username"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 pr-14 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-zinc-600"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="space-y-3">
                <p className="text-rose-500 text-sm font-medium flex items-center gap-2">
                  <span className="w-1 h-1 bg-rose-500 rounded-full" />
                  {error}
                </p>
                {error === 'User not found' && (
                  <button 
                    type="button"
                    onClick={handleInitialize}
                    disabled={isInitializing}
                    className="w-full text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 px-4 py-2 rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-50"
                  >
                    {isInitializing ? 'Initializing...' : 'Initialize with Default Admin (admin/admin123)'}
                  </button>
                )}
              </div>
            )}
            <button 
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-emerald-900/20 active:scale-[0.98]"
            >
              Sign In
            </button>
          </form>

          <div className="mt-12 p-6 bg-zinc-800/30 rounded-2xl border border-zinc-800/50 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Enterprise Portal</h3>
                <p className="text-[10px] text-zinc-500 mt-1">Authorized Personnel Only</p>
              </div>
              <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                 <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">Secure</span>
                 </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700/50">
                  <Lock className="w-4 h-4 text-zinc-500" />
                </div>
                <p className="text-[11px] text-zinc-400 font-medium leading-tight">MFA authentication supported for enhanced session security.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700/50">
                  <Users className="w-4 h-4 text-zinc-500" />
                </div>
                <p className="text-[11px] text-zinc-400 font-medium leading-tight">Role-based access control for technical and management teams.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex justify-between items-end border-t border-zinc-800 pt-8">
          <p className="text-[11px] text-zinc-600 font-medium">{settings.copyright_text}</p>
          <p className="text-[11px] text-zinc-600 font-mono">{settings.app_version}</p>
        </div>
      </div>

      {/* Right Column: Slideshow Section */}
      <div className="flex-1 relative bg-zinc-950 hidden md:block">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 to-transparent z-10" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-zinc-950 to-transparent z-10" />
            
            <img 
              src={images[currentSlide]?.url || "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&q=80&w=1200"} 
              alt="MBI Service"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </motion.div>
        </AnimatePresence>

        <div className="absolute bottom-16 left-16 z-20 max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            key={`text-${currentSlide}`}
            className="space-y-4"
          >
            <div className="w-12 h-1 bg-emerald-500 rounded-full" />
            <h2 className="text-5xl font-black text-white leading-tight uppercase tracking-tighter">
              {images[currentSlide]?.title || "Precision in Every Repair."}
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed">
              {images[currentSlide]?.caption || "Providing high-standard diagnostic and repair services for professional equipment including sound systems, computers, and specialized electronics."}
            </p>
          </motion.div>

          <div className="flex gap-2 mt-8">
            {images.map((_: any, idx: number) => (
              <button 
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={cn(
                  "h-1.5 transition-all duration-500 rounded-full",
                  currentSlide === idx ? "w-8 bg-emerald-500" : "w-1.5 bg-zinc-700"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnnouncementBar() {
  const [settings, setSettings] = useState<{ text: string; speed: string }>({ text: '', speed: '30' });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'settings'), (snapshot) => {
      const data: any = {};
      snapshot.forEach(doc => {
        data[doc.id] = doc.data().value;
      });
      setSettings({
        text: data.announcement_text || '',
        speed: data.announcement_speed || '30'
      });
    });

    return () => unsubscribe();
  }, []);

  if (!settings.text) return <div className="flex-1" />;

  return (
    <div className="flex-1 overflow-hidden mx-8 hidden lg:block">
      <div 
        className="whitespace-nowrap inline-block animate-marquee hover:pause cursor-default"
        style={{ animationDuration: `${settings.speed}s` }}
      >
        <span className="text-xl font-bold text-emerald-400/80 tracking-wide inline-flex items-center gap-3 font-doto">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
          {settings.text}
        </span>
      </div>
    </div>
  );
}

function AppInner() {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const savedUser = localStorage.getItem('mbi_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('mbi_user', JSON.stringify(u));
    
    // Navigate to role-specific home screen
    if (u.role === 'TECHNICIAN') {
      navigate('/my-jobs');
    } else if (u.role === 'OPERATOR') {
      navigate('/requests');
    } else {
      navigate('/');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('mbi_user');
    navigate('/');
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-200 overflow-hidden">
      <Sidebar user={user} onLogout={handleLogout} />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-10 no-print">
          <div className="flex items-center gap-4">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Search requests..." 
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>
          </div>

          <AnnouncementBar />
          
          <div className="flex items-center gap-4 shrink-0">
            <button className="p-2 text-zinc-400 hover:text-white transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-blue-600 rounded-full border-2 border-zinc-950"></span>
            </button>
            <div className="h-8 w-px bg-zinc-800 mx-2"></div>
            <Link to="/profile" className="flex items-center gap-3 hover:bg-zinc-800/30 p-1 rounded-full pr-3 transition-all group">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-white">{user.name}</p>
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest leading-none">{user.role}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg overflow-hidden border-2 border-zinc-800 group-hover:border-blue-500/50 transition-all">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  user.name.charAt(0)
                )}
              </div>
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/requests" element={<ServiceRequestList user={user} />} />
            <Route path="/new-request" element={<ServiceRequestForm user={user} />} />
            <Route path="/my-jobs" element={<TechnicianView user={user} />} />
            <Route path="/billing" element={<BillingView user={user} />} />
            <Route path="/users" element={<AdminPanel user={user} />} />
            <Route path="/settings" element={<SettingsView user={user} />} />
            <Route path="/profile" element={<ProfileView user={user} onUpdateUser={(u) => {
              setUser(u);
              localStorage.setItem('mbi_user', JSON.stringify(u));
            }} />} />
            <Route path="/change-password" element={<ChangePassword user={user} />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppInner />
      <Toaster position="bottom-right" theme="dark" richColors />
    </Router>
  );
}
