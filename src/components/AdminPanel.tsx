import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Shield, 
  UserPlus, 
  MoreVertical, 
  Mail, 
  Lock,
  CheckCircle2,
  XCircle,
  X,
  Save,
  User as UserIcon,
  Key,
  Package,
  LayoutGrid,
  List,
  Database,
  Trash2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, UserRole } from '../types';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import PartsManagement from './PartsManagement';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, addDoc, getDocs, setDoc } from 'firebase/firestore';

export default function AdminPanel({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<'users' | 'parts' | 'maintenance'>('users');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetPin, setResetPin] = useState('');
  const [currentSystemPin, setCurrentSystemPin] = useState('123456');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    name: '',
    role: 'TECHNICIAN' as UserRole
  });

  const [editUserData, setEditUserData] = useState({
    username: '',
    password: '',
    name: '',
    role: 'TECHNICIAN' as UserRole
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));
      setUsers(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'security'), (snapshot) => {
      if (snapshot.exists() && snapshot.data().reset_pin) {
        setCurrentSystemPin(snapshot.data().reset_pin);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'users'), {
        ...newUser,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      setIsAddingUser(false);
      setNewUser({ username: '', password: '', name: '', role: 'TECHNICIAN' });
      toast.success('User created successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'users');
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const updateData: any = {
        username: editUserData.username,
        name: editUserData.name,
        role: editUserData.role,
        updated_at: new Date().toISOString()
      };
      
      if (editUserData.password) {
        updateData.password = editUserData.password;
      }

      await updateDoc(doc(db, 'users', editingUser.id), updateData);
      setEditingUser(null);
      toast.success('User updated successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${editingUser.id}`);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    try {
      await deleteDoc(doc(db, 'users', id));
      toast.success('User deleted successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${id}`);
    }
  };

  const startEditing = (u: User) => {
    setEditingUser(u);
    setEditUserData({
      username: u.username,
      password: '', // Don't show password
      name: u.name,
      role: u.role
    });
  };

  const totalPages = Math.ceil(users.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = users.slice(indexOfFirstItem, indexOfLastItem);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case 'ADMIN': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
      case 'POWER_USER': return 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20';
      case 'TECHNICIAN': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      case 'OPERATOR': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      case 'MANAGER': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      default: return 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
    }
  };

  const handleResetData = async () => {
    console.log('Reset triggered with PIN:', resetPin);
    
    // Basic verification
    if (!resetPin) {
      toast.error('Please enter the Security PIN');
      return;
    }

    if (resetPin !== currentSystemPin) {
      toast.error('Invalid Security PIN. Access Denied.');
      return;
    }

    if (!showConfirmReset) {
      setShowConfirmReset(true);
      return;
    }

    setIsResetting(true);
    const resetLoadingToast = toast.loading('Initiating system wipe...');
    
    try {
      console.log('PHASE 1: Fetching service requests...');
      const srSnap = await getDocs(collection(db, 'service_requests'));
      console.log(`Found ${srSnap.size} service requests.`);
      
      if (!srSnap.empty) {
        toast.loading(`Processing ${srSnap.size} requests...`, { id: resetLoadingToast });
        
        // Use chunks to avoid overwhelming the connection
        const chunks = [];
        const srDocs = srSnap.docs;
        for (let i = 0; i < srDocs.length; i += 10) {
          chunks.push(srDocs.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          await Promise.all(chunk.map(async (srDoc) => {
            const id = srDoc.id;
            const subs = ['parts', 'logs', 'billing'];
            
            await Promise.all(subs.map(async (sub) => {
              try {
                const subSnap = await getDocs(collection(db, `service_requests/${id}/${sub}`));
                if (!subSnap.empty) {
                  await Promise.all(subSnap.docs.map(d => deleteDoc(d.ref)));
                }
              } catch (e) {
                console.warn(`Failed to clear subcollection ${sub} for ${id}:`, e);
              }
            }));
            
            return deleteDoc(srDoc.ref);
          }));
        }
      }

      console.log('PHASE 2: Clearing top-level collections...');
      const collectionsToClear = ['billing'];
      
      for (const collName of collectionsToClear) {
        toast.loading(`Clearing ${collName}...`, { id: resetLoadingToast });
        const snap = await getDocs(collection(db, collName));
        console.log(`Clearing ${snap.size} documents from ${collName}`);
        
        // Chunked top-level deletes
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 20) {
          const chunk = docs.slice(i, i + 20);
          await Promise.all(chunk.map(d => deleteDoc(d.ref)));
        }
      }

      console.log('PHASE 3: Resetting configurations...');
      toast.loading('Resetting sequence counters...', { id: resetLoadingToast });
      await Promise.all([
        setDoc(doc(db, 'settings', 'quote_counter'), { value: 3000 }, { merge: true }),
        setDoc(doc(db, 'settings', 'invoice_counter'), { value: 5000 }, { merge: true }),
        setDoc(doc(db, 'settings', 'last_reset_at'), { value: new Date().toISOString() }, { merge: true })
      ]);

      console.log('Wipe complete.');
      setResetPin('');
      setShowConfirmReset(false);
      setIsResetting(false);
      toast.dismiss(resetLoadingToast);
      toast.success('System has been fully reset. Reloading application...');
      
      // Force reload to clear all cached states and listeners
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error('CRITICAL RESET ERROR:', err);
      setIsResetting(false);
      toast.dismiss(resetLoadingToast);
      toast.error(`Reset Failed: ${err.message || 'Check connection'}`);
      handleFirestoreError(err, OperationType.DELETE, 'system_reset');
    }
  };

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
            activeTab === 'users' 
              ? "bg-zinc-800 text-white shadow-lg" 
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Users className="w-4 h-4" />
          Users
        </button>
        <button
          onClick={() => setActiveTab('parts')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
            activeTab === 'parts' 
              ? "bg-zinc-800 text-white shadow-lg" 
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Package className="w-4 h-4" />
          Parts Inventory
        </button>
        <button
          onClick={() => setActiveTab('maintenance')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
            activeTab === 'maintenance' 
              ? "bg-zinc-800 text-rose-500 shadow-lg" 
              : "text-zinc-500 hover:text-rose-400"
          )}
        >
          <Database className="w-4 h-4" />
          Maintenance
        </button>
      </div>

      {activeTab === 'users' ? (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white">User Management</h1>
              <p className="text-zinc-500 text-sm">Control system access and permissions</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    viewMode === 'grid' ? "bg-zinc-800 text-blue-500 shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                  )}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    viewMode === 'list' ? "bg-zinc-800 text-blue-500 shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                  )}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
              <button 
                onClick={() => setIsAddingUser(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                Add User
              </button>
            </div>
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {loading ? (
                [1,2,3].map(i => <div key={i} className="h-48 bg-zinc-900 rounded-2xl animate-pulse"></div>)
              ) : currentItems.length === 0 ? (
                <div className="col-span-full py-12 text-center text-zinc-500 bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-800">
                  No users found.
                </div>
              ) : currentItems.map((u) => (
                <div key={u.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all group">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center text-white font-bold text-lg border border-zinc-700 overflow-hidden ring-blue-500/10 group-hover:ring-4 transition-all">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          u.name.charAt(0)
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors">{u.name}</h3>
                        <p className="text-xs text-zinc-500">@{u.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => startEditing(u)}
                        className="p-2 text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteUser(u.id)}
                        className="p-2 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-500">Access Level</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase",
                        getRoleColor(u.role)
                      )}>
                        {u.role.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-500">Status</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                        <span className="text-xs text-emerald-500 font-medium">Active</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-zinc-800 flex items-center gap-2">
                    <button 
                      onClick={() => startEditing(u)}
                      className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-bold text-zinc-300 transition-colors"
                    >
                      Edit Account Settings
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-zinc-950/50 border-b border-zinc-800">
                  <tr>
                    <th className="px-8 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">User Identity</th>
                    <th className="px-8 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">Access Level</th>
                    <th className="px-8 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Login ID</th>
                    <th className="px-8 py-5 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {currentItems.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-800/30 transition-all group cursor-pointer" onClick={() => startEditing(u)}>
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold group-hover:bg-blue-600/10 group-hover:text-blue-500 transition-all border border-zinc-700 overflow-hidden">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                            ) : (
                              u.name.charAt(0)
                            )}
                          </div>
                          <div>
                            <span className="block font-bold text-white group-hover:text-blue-400 transition-colors">{u.name}</span>
                            <span className="text-[10px] text-zinc-500">Active Account</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase inline-block",
                          getRoleColor(u.role)
                        )}>
                          {u.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-8 py-4 px-6 py-4 font-mono text-xs text-blue-500/70">@{u.username}</td>
                      <td className="px-8 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => startEditing(u)}
                            className="p-2 text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all"
                            title="Quick Edit"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-2 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                            title="Remove User"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* User Pagination */}
          {!loading && users.length > 0 && (
            <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-2xl px-8 py-4">
              <div className="text-xs text-zinc-500 font-medium">
                Showing <span className="text-zinc-300">{indexOfFirstItem + 1}</span> to <span className="text-zinc-300">{Math.min(indexOfLastItem, users.length)}</span> of <span className="text-zinc-300">{users.length}</span> users
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => paginate(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold border transition-all",
                      currentPage === 1
                        ? "bg-zinc-950 border-zinc-800 text-zinc-700 cursor-not-allowed"
                        : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                    )}
                  >
                    Prev
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((number) => (
                      <button
                        key={number}
                        onClick={() => paginate(number)}
                        className={cn(
                          "w-8 h-8 rounded-xl text-xs font-bold transition-all flex items-center justify-center border",
                          currentPage === number
                            ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20"
                            : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500"
                        )}
                      >
                        {number}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => paginate(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold border transition-all",
                      currentPage === totalPages
                        ? "bg-zinc-950 border-zinc-800 text-zinc-700 cursor-not-allowed"
                        : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                    )}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Role Definitions */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
            <div className="flex items-center gap-2 text-zinc-400 mb-6">
              <Shield className="w-5 h-5" />
              <h2 className="font-bold">Role Definitions</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <RoleInfo 
                title="Administrator" 
                desc="Full system access. Manage all users, parameters, and financial data." 
                role="ADMIN"
              />
              <RoleInfo 
                title="Power User" 
                desc="Manage application parameters and service data. Limited user management." 
                role="POWER_USER"
              />
              <RoleInfo 
                title="Technician" 
                desc="Manage assigned service units, add replacement parts, and update job status." 
                role="TECHNICIAN"
              />
              <RoleInfo 
                title="Operator" 
                desc="Register incoming customer requests and assign units to technicians." 
                role="OPERATOR"
              />
              <RoleInfo 
                title="Manager" 
                desc="View-only access to dashboards, reports, and billing information." 
                role="MANAGER"
              />
            </div>
          </div>
        </>
      ) : activeTab === 'parts' ? (
        <PartsManagement />
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-8 flex items-start gap-6">
            <div className="p-4 bg-rose-500/20 rounded-2xl shrink-0">
              <AlertTriangle className="w-8 h-8 text-rose-500" />
            </div>
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white">Critical Maintenance Tools</h2>
              <p className="text-zinc-400 text-sm leading-relaxed max-w-2xl">
                The tools below are designed for system initialization and testing. 
                Using these tools will permanently delete data and cannot be undone. 
                Please ensure you have backups if necessary.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-xl">
                  <Database className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Cloud Migration</h3>
                  <p className="text-zinc-500 text-xs">Port data from local server to Cloud Firestore</p>
                </div>
              </div>
              
              <div className="p-6 bg-blue-500/5 rounded-xl space-y-4">
                <p className="text-xs text-blue-400 font-medium italic">Use this if you see no data after the recent update.</p>
                <div className="grid grid-cols-1 gap-1">
                  <p className="text-[10px] text-zinc-500 flex items-center gap-2">
                    <span className="w-1 h-1 bg-blue-500 rounded-full" /> 
                    Migrates Users & Passwords
                  </p>
                  <p className="text-[10px] text-zinc-500 flex items-center gap-2">
                    <span className="w-1 h-1 bg-blue-500 rounded-full" /> 
                    Migrates all Service Requests (SR#)
                  </p>
                  <p className="text-[10px] text-zinc-500 flex items-center gap-2">
                    <span className="w-1 h-1 bg-blue-500 rounded-full" /> 
                    Migrates Invoices, Parts & Brands
                  </p>
                </div>
              </div>

              <button
                onClick={async () => {
                  if (!confirm('This will copy all data from the local SQLite database to Firestore. It will not delete anything on the local server. Continue?')) return;
                  const loadingToast = toast.loading('Initializing migration tunnel...');
                  try {
                    const res = await fetch('/api/migrate-from-sqlite', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                      toast.success('System migration complete! Your data is now in the cloud.', { id: loadingToast });
                      setTimeout(() => window.location.reload(), 2000);
                    } else {
                      throw new Error(data.error || 'Server rejected migration');
                    }
                  } catch (err: any) {
                    toast.error(`Migration Failed: ${err.message}`, { id: loadingToast });
                  }
                }}
                className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 border border-zinc-700 hover:border-blue-500/50"
              >
                <RefreshCw className="w-4 h-4" />
                Migrate Local Data
              </button>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-zinc-800 rounded-xl">
                  <Trash2 className="w-6 h-6 text-zinc-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Reset Application Data</h3>
                  <p className="text-zinc-500 text-xs">Clear all service requests and billing data</p>
                </div>
              </div>
              
              <div className="p-6 bg-zinc-950/50 rounded-xl space-y-4">
                <p className="text-xs text-zinc-500 italic">This will clear:</p>
                <ul className="grid grid-cols-2 gap-2">
                  <li className="flex items-center gap-2 text-[10px] text-zinc-400 font-medium">
                    <div className="w-1 h-1 rounded-full bg-rose-500" />
                    All Service Requests
                  </li>
                  <li className="flex items-center gap-2 text-[10px] text-zinc-400 font-medium">
                    <div className="w-1 h-1 rounded-full bg-rose-500" />
                    All Invoices & Quotes
                  </li>
                </ul>
                <div className="text-[10px] text-emerald-500 font-medium flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-emerald-500" />
                  Brands & Parts Inventory will be retained
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400">Enter Security PIN (6-digits)</label>
                  <span className="text-[10px] text-zinc-600 font-mono">Verify current PIN to execute</span>
                </div>
                <input
                  type="password"
                  maxLength={6}
                  value={resetPin}
                  onChange={(e) => setResetPin(e.target.value)}
                  placeholder="••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500/40 transition-all text-center tracking-[1em] text-lg font-mono"
                />
              </div>

              <button
                onClick={handleResetData}
                disabled={resetPin !== currentSystemPin || isResetting}
                className={cn(
                  "w-full py-4 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2",
                  resetPin !== currentSystemPin 
                    ? "bg-zinc-800 text-zinc-600 cursor-not-allowed opacity-50 grayscale" 
                    : showConfirmReset 
                      ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20 animate-pulse" 
                      : "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20",
                  isResetting && "opacity-70 cursor-wait"
                )}
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Resetting System...
                  </>
                ) : showConfirmReset ? (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    CLICK AGAIN TO CONFIRM RESET
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Execute Full Data Reset
                  </>
                )}
              </button>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-zinc-800 rounded-xl">
                  <Shield className="w-6 h-6 text-zinc-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Security Settings</h3>
                  <p className="text-zinc-500 text-xs">Update system reset protection</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400">Current Security PIN</label>
                  <span className="text-[10px] text-zinc-500">Verify current to update</span>
                </div>
                <input
                  type="password"
                  maxLength={6}
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="OLD PIN"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all text-center tracking-[1em] text-lg font-mono"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400">New 6-Digit PIN</label>
                  <span className="text-[10px] text-zinc-500">Must be exactly 6 digits</span>
                </div>
                <input
                  type="password"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setNewPin(val);
                  }}
                  placeholder="NEW PIN"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all text-center tracking-[1em] text-lg font-mono"
                />
              </div>

              <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                <p className="text-[10px] text-blue-400 leading-relaxed italic">
                  Changing the PIN will immediately update the requirement for all data reset operations. 
                  Please store this safely.
                </p>
              </div>

              <button 
                onClick={async () => {
                  if (oldPin !== currentSystemPin) {
                    toast.error('Current PIN is incorrect');
                    return;
                  }
                  if (newPin.length !== 6) {
                    toast.error('PIN must be exactly 6 digits');
                    return;
                  }
                  setIsChangingPin(true);
                  try {
                    await setDoc(doc(db, 'settings', 'security'), { 
                      reset_pin: newPin,
                      updated_at: new Date().toISOString()
                    }, { merge: true });
                    toast.success('Security PIN updated successfully');
                    setNewPin('');
                    setOldPin('');
                  } catch (e) {
                    toast.error('Failed to update PIN');
                  } finally {
                    setIsChangingPin(false);
                  }
                }}
                disabled={newPin.length !== 6 || oldPin.length !== 6 || isChangingPin}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95"
              >
                {isChangingPin ? 'Updating...' : 'Update Security PIN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      <AnimatePresence>
        {isAddingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <form onSubmit={handleAddUser}>
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Add New User</h2>
                  <button type="button" onClick={() => setIsAddingUser(false)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>
                <div className="p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Full Name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        type="text"
                        required
                        value={newUser.name}
                        onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                        placeholder="e.g. John Doe"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Username</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        type="text"
                        required
                        value={newUser.username}
                        onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                        placeholder="e.g. jdoe"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Password</label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        type="password"
                        required
                        value={newUser.password}
                        onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                        placeholder="••••••••"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Role</label>
                    <select 
                      value={newUser.role}
                      onChange={(e) => setNewUser({...newUser, role: e.target.value as UserRole})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="ADMIN">Administrator</option>
                      <option value="POWER_USER">Power User</option>
                      <option value="TECHNICIAN">Technician</option>
                      <option value="OPERATOR">Operator</option>
                      <option value="MANAGER">Manager</option>
                    </select>
                  </div>
                </div>
                <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsAddingUser(false)}
                    className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-blue-600/20"
                  >
                    <Save className="w-4 h-4" />
                    Create User
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <form onSubmit={handleEditUser}>
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">Edit User</h2>
                    <p className="text-xs text-zinc-500">Updating account for {editingUser.name}</p>
                  </div>
                  <button type="button" onClick={() => setEditingUser(null)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>
                <div className="p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Full Name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        type="text"
                        required
                        value={editUserData.name}
                        onChange={(e) => setEditUserData({...editUserData, name: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Username</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        type="text"
                        required
                        value={editUserData.username}
                        onChange={(e) => setEditUserData({...editUserData, username: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">New Password (leave blank to keep current)</label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        type="password"
                        value={editUserData.password}
                        onChange={(e) => setEditUserData({...editUserData, password: e.target.value})}
                        placeholder="••••••••"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Role</label>
                    <select 
                      value={editUserData.role}
                      onChange={(e) => setEditUserData({...editUserData, role: e.target.value as UserRole})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="ADMIN">Administrator</option>
                      <option value="POWER_USER">Power User</option>
                      <option value="TECHNICIAN">Technician</option>
                      <option value="OPERATOR">Operator</option>
                      <option value="MANAGER">Manager</option>
                    </select>
                  </div>
                </div>
                <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-blue-600/20"
                  >
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RoleInfo({ title, desc, role }: any) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        {title}
      </h3>
      <p className="text-xs text-zinc-500 leading-relaxed">
        {desc}
      </p>
    </div>
  );
}
