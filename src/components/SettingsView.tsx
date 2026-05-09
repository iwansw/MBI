import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Package, 
  Layers,
  Database,
  ShieldCheck,
  Building2
} from 'lucide-react';
import { motion } from 'motion/react';
import { User } from '../types';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import PartsManagement from './PartsManagement';
import BrandsManagement from './BrandsManagement';

import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, getDocs, doc, setDoc } from 'firebase/firestore';

export default function SettingsView({ user }: { user: User }) {
  const [activeMenu, setActiveMenu] = useState<'parts' | 'brands' | 'general'>('parts');

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">System Settings</h1>
        <p className="text-zinc-500 text-sm">Configure application parameters and manage master data.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-64 shrink-0 space-y-1">
          <MenuButton 
            active={activeMenu === 'parts'} 
            onClick={() => setActiveMenu('parts')}
            icon={Package}
            label="Parts Inventory"
          />
          <MenuButton 
            active={activeMenu === 'brands'} 
            onClick={() => setActiveMenu('brands')}
            icon={Building2}
            label="Brands Management"
          />
          <MenuButton 
            active={activeMenu === 'general'} 
            onClick={() => setActiveMenu('general')}
            icon={Layers}
            label="General Settings"
          />
        </aside>

        {/* Content Area */}
        <div className="flex-1">
          {activeMenu === 'parts' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <PartsManagement />
            </motion.div>
          )}

          {activeMenu === 'brands' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <BrandsManagement />
            </motion.div>
          )}

          {activeMenu === 'general' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8"
            >
              <GeneralSettings />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'settings'), (snapshot) => {
      const data: Record<string, string> = {};
      snapshot.forEach(doc => {
        data[doc.id] = doc.data().value;
      });
      setSettings(data);
      setLoading(false);
    }, (error) => {
       handleFirestoreError(error, OperationType.LIST, 'settings');
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(settings)) {
        await setDoc(doc(db, 'settings', key), { value });
      }
      toast.success('Settings saved successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-blue-500/10 rounded-xl">
          <SettingsIcon className="w-6 h-6 text-blue-500" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">General System Settings</h3>
          <p className="text-zinc-500 text-sm">Update company identity and billing document information.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Company Name</label>
          <input 
            type="text" 
            value={settings.company_name || ''}
            onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="MBI Service Center"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Company Email</label>
          <input 
            type="email" 
            value={settings.company_email || ''}
            onChange={(e) => setSettings({ ...settings, company_email: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="support@mbiservice.com"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Company Phone</label>
          <input 
            type="text" 
            value={settings.company_phone || ''}
            onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="+1 (555) 123-4567"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Default Service Fee</label>
          <input 
            type="number" 
            step="0.01"
            value={settings.base_service_fee || ''}
            onChange={(e) => setSettings({ ...settings, base_service_fee: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
            placeholder="50.00"
          />
        </div>
        <div className="md:col-span-2 space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Company Address (Appears on Invoice)</label>
          <textarea 
            rows={3}
            value={settings.company_address || ''}
            onChange={(e) => setSettings({ ...settings, company_address: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            placeholder="123 Tech Avenue, Silicon Valley"
          />
        </div>
        <div className="md:col-span-1 space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Announcement Running Text</label>
          <input 
            type="text" 
            value={settings.announcement_text || ''}
            onChange={(e) => setSettings({ ...settings, announcement_text: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="Type your announcement here..."
          />
        </div>
        <div className="md:col-span-1 space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Scroll Speed (Seconds)</label>
          <input 
            type="number" 
            value={settings.announcement_speed || '30'}
            onChange={(e) => setSettings({ ...settings, announcement_speed: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="30"
            min="5"
            max="120"
          />
          <p className="text-[10px] text-zinc-500 italic">Lower is faster (e.g., 20s is faster than 40s).</p>
        </div>

        <div className="md:col-span-2 space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Slideshow Images (JSON Array of Objects)</label>
          <textarea 
            value={settings.slideshow_images || ''}
            onChange={(e) => setSettings({ ...settings, slideshow_images: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono text-sm"
            rows={5}
            placeholder='[{"url": "...", "title": "...", "caption": "..."}]'
          />
          <p className="text-[10px] text-zinc-500 italic">Format: {'[{"url": "...", "title": "...", "caption": "..."}]'}</p>
        </div>

        <div className="md:col-span-1 space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">App Version</label>
          <input 
            type="text" 
            value={settings.app_version || ''}
            onChange={(e) => setSettings({ ...settings, app_version: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="v1.0.0"
          />
        </div>

        <div className="md:col-span-1 space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Copyright Info</label>
          <input 
            type="text" 
            value={settings.copyright_text || ''}
            onChange={(e) => setSettings({ ...settings, copyright_text: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="© 2026 MBI"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-zinc-800 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </form>
  );
}

function MenuButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
        active 
          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
