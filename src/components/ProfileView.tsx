import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User as UserIcon, 
  Camera, 
  Shield, 
  Lock, 
  Save, 
  Eye, 
  EyeOff, 
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Info,
  X,
  ZoomIn,
  Move
} from 'lucide-react';
import { toast } from 'sonner';
import Cropper from 'react-easy-crop';
import { User, UserRole } from '../types';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';
import getCroppedImg from '../lib/cropImage';

interface ProfileViewProps {
  user: User;
  onUpdateUser: (updatedUser: User) => void;
}

export default function ProfileView({ user, onUpdateUser }: ProfileViewProps) {
  const [loading, setLoading] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cropping State
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [showCropper, setShowCropper] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const roleGuidelines: Record<UserRole, { title: string, description: string, capabilities: string[] }> = {
    'ADMIN': {
      title: 'Full Administrator',
      description: 'You have full administrative privileges over the entire system.',
      capabilities: [
        'Manage all user accounts and roles',
        'Configure system-wide settings',
        'Directly modify service request data',
        'Access full billing and financial reports',
        'Perform system maintenance and data migration'
      ]
    },
    'POWER_USER': {
      title: 'Power User',
      description: 'You can manage service data and application parameters.',
      capabilities: [
        'Manage service requests and billing',
        'Update parts inventory and brand information',
        'View all dashboards and reports',
        'Limited user visibility'
      ]
    },
    'TECHNICIAN': {
      title: 'Technician',
      description: 'Your focus is on technical diagnostics and repairs.',
      capabilities: [
        'Manage assigned service requests',
        'Add replacement parts to jobs',
        'Update job status and technical notes',
        'View own performance metrics'
      ]
    },
    'OPERATOR': {
      title: 'Operator',
      description: 'You handle customer interactions and request registration.',
      capabilities: [
        'Register new service requests',
        'Assign requests to technicians',
        'Update basic customer information',
        'Handle intake and initial queue management'
      ]
    },
    'MANAGER': {
      title: 'Manager',
      description: 'You have strategic visibility across the operation.',
      capabilities: [
        'View all dashboards and analytical reports',
        'Overview of billing and service performance',
        'Cannot modify technical data or user accounts',
        'Audit-level access to service history'
      ]
    }
  };

  const onCropComplete = useCallback((_: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImageToCrop(reader.result as string);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be uploaded again if needed
    e.target.value = '';
  };

  const handleSaveCroppedImage = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;

    setLoading(true);
    try {
      const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels);
      
      // Check size of result (base64 string is roughly 33% larger than binary)
      // Firestore limit is 1MB, but it's better to keep it smaller for avatars
      if (croppedImage.length > 800000) { 
        toast.error('The cropped image is too large. Try zooming in or out.');
        setLoading(false);
        return;
      }

      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        avatar_url: croppedImage,
        updated_at: new Date().toISOString()
      });
      
      const updatedUser = { ...user, avatar_url: croppedImage };
      onUpdateUser(updatedUser);
      toast.success('Profile picture updated');
      setShowCropper(false);
      setImageToCrop(null);
    } catch (error) {
      console.error('Crop save error:', error);
      toast.error('Failed to save cropped image');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setSavingPassword(true);
    try {
      const userRef = doc(db, 'users', user.id);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) throw new Error('User not found');
      
      const userData = userSnap.data();
      if (userData.password !== currentPassword) {
        throw new Error('Incorrect current password');
      }

      await updateDoc(userRef, {
        password: newPassword,
        updated_at: new Date().toISOString()
      });

      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const currentRoleInfo = roleGuidelines[user.role];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 text-white">
      {/* Photo Cropper Modal */}
      <AnimatePresence>
        {showCropper && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 shadow-2xl">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCropper(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-[2rem] overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Crop Profile Picture</h3>
                    <p className="text-zinc-500 text-xs">Adjust position and zoom for the perfect fit</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCropper(false)}
                  className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="relative h-[400px] w-full bg-zinc-950">
                {imageToCrop && (
                  <Cropper
                    image={imageToCrop}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
                )}
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-zinc-400">
                    <div className="flex items-center gap-2">
                      <ZoomIn className="w-3 h-3" />
                      Zoom Level
                    </div>
                    <span>{Math.round(zoom * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby="Zoom"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                    <span>1.0x</span>
                    <span>3.0x</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setShowCropper(false)}
                    className="flex-1 px-6 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCroppedImage}
                    disabled={loading}
                    className="flex-[2] px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        Apply Crop & Save
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header Segment */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <UserIcon className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">User Profile</h1>
            <p className="text-zinc-500 text-sm">Personalize your account and view role guidelines</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Core Identity */}
        <div className="lg:col-span-1 space-y-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 relative overflow-hidden group"
          >
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-3xl rounded-full translate-x-16 -translate-y-16" />
            
            <div className="relative flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="w-32 h-32 rounded-3xl overflow-hidden ring-4 ring-zinc-800 bg-zinc-950 flex items-center justify-center border-2 border-zinc-800 shadow-2xl transition-all group-hover:scale-[1.02]">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-12 h-12 text-zinc-700" />
                  )}
                  {loading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xl transition-all active:scale-90"
                  title="Update Profile Picture"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>

              <h2 className="text-xl font-bold text-white mb-1">{user.name}</h2>
              <p className="text-sm font-mono text-blue-500 mb-6">@{user.username}</p>

              <div className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                user.role === 'ADMIN' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                user.role === 'POWER_USER' ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" :
                user.role === 'TECHNICIAN' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                user.role === 'OPERATOR' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
              )}>
                {user.role}
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-zinc-800 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 font-medium tracking-wider uppercase">System Access</span>
                <span className="text-emerald-500 font-bold flex items-center gap-1">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                  ONLINE
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 font-medium tracking-wider uppercase">User ID</span>
                <span className="text-zinc-400 font-mono">{user.id.slice(0, 8)}...</span>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <Info className="w-5 h-5 text-zinc-400" />
              <h3 className="font-bold text-white">Current Role: {user.role}</h3>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed italic">
              "Your permissions are determined by your assigned role. Contact your administrator if you believe your access level needs correction."
            </p>
          </motion.div>
        </div>

        {/* Right Column: Roles & Security */}
        <div className="lg:col-span-2 space-y-8">
          {/* Role Guideline Card */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden"
          >
            <div className="p-8 border-b border-zinc-800 bg-zinc-800/20">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-6 h-6 text-emerald-500" />
                <h3 className="text-xl font-bold text-white">Role Guideline & Capabilities</h3>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">
                As a <span className="text-emerald-500 font-bold">{currentRoleInfo.title}</span>, you are responsible for the following areas of the MBI Service Center ecosystem.
              </p>
            </div>
            
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] mb-4">Functional Scope</h4>
                  <p className="text-sm text-zinc-300 leading-relaxed mb-6">
                    {currentRoleInfo.description}
                  </p>
                  
                  <div className="p-4 bg-zinc-950/50 rounded-2xl border border-zinc-800/50">
                    <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Core Invariants</h5>
                    <ul className="space-y-2">
                       <li className="text-xs text-zinc-400 flex items-center gap-2">
                         <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                         Integrity-first diagnostic reporting
                       </li>
                       <li className="text-xs text-zinc-400 flex items-center gap-2">
                         <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                         Secure data isolation enforcement
                       </li>
                    </ul>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] mb-4">Specific Capabilities</h4>
                  <div className="space-y-3">
                    {currentRoleInfo.capabilities.map((cap, i) => (
                      <div key={i} className="flex items-start gap-3 group">
                        <div className="mt-1 flex-shrink-0 w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <ChevronRight className="w-2.5 h-2.5 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                        <span className="text-sm text-zinc-300 leading-tight">{cap}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Change Password Segment */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Security & Authentication</h3>
                <p className="text-zinc-500 text-xs">Maintain your account rotation and password security</p>
              </div>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Current PIN/Password</label>
                  <div className="relative">
                    <input 
                      type={showCurrentPassword ? "text" : "password"} 
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono text-sm"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">New Password</label>
                  <div className="relative">
                    <input 
                      type={showNewPassword ? "text" : "password"} 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono text-sm"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Confirm New Password</label>
                  <div className="relative">
                    <input 
                      type={showConfirmPassword ? "text" : "password"} 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono text-sm"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <AlertCircle className="w-4 h-4 text-zinc-600" />
                  <span>Passwords must be at least 6 characters long.</span>
                </div>
                <button 
                  type="submit"
                  disabled={savingPassword}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2 active:scale-95"
                >
                  {savingPassword ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : <Save className="w-4 h-4" />}
                  Save New Password
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

