import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Eye, 
  Edit3, 
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  UserPlus,
  RefreshCw,
  X,
  Save,
  ShieldCheck,
  Laptop,
  Phone,
  User as UserIcon,
  Hash,
  MapPin,
  PlusCircle,
  Plus,
  ShieldAlert,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, ServiceRequest, Brand, ServiceLog } from '../types';
import { cn, formatDateTime, formatCurrency, formatNumberWithDots, parseDotNumber } from '../lib/utils';
import { toast } from 'sonner';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, where, doc, updateDoc, deleteDoc, addDoc, getDocs, limit, serverTimestamp } from 'firebase/firestore';

export default function ServiceRequestList({ user }: { user: User }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [viewingRequest, setViewingRequest] = useState<ServiceRequest | null>(null);
  const [viewingRequestLogs, setViewingRequestLogs] = useState<ServiceLog[]>([]);
  const [viewingRequestParts, setViewingRequestParts] = useState<any[]>([]);
  const [newLogNote, setNewLogNote] = useState('');
  const [isLogImportant, setIsLogImportant] = useState(false);
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [editingRequest, setEditingRequest] = useState<ServiceRequest | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;

  useEffect(() => {
    const q = query(collection(db, 'service_requests'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ServiceRequest));
      setRequests(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'service_requests');
    });

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));
      setTechnicians(data.filter(u => u.role === 'TECHNICIAN'));
    });

    const unsubscribeBrands = onSnapshot(collection(db, 'brands'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Brand));
      setBrands(data);
    });

    return () => {
      unsubscribe();
      unsubscribeUsers();
      unsubscribeBrands();
    };
  }, []);

  useEffect(() => {
    if (requests.length > 0 && location.state?.requestId) {
      const request = requests.find(r => r.id === location.state.requestId);
      if (request) {
        setViewingRequest(request);
        // Clear state to avoid reopening on refresh if desired, 
        // though usually keeping it for the session is fine.
        window.history.replaceState({}, document.title);
      }
    }
  }, [requests, location.state]);

  useEffect(() => {
    if (viewingRequest) {
      const qLogs = query(
        collection(db, `service_requests/${viewingRequest.id}/logs`), 
        orderBy('created_at', 'desc')
      );
      const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ServiceLog));
        setViewingRequestLogs(data);
      });

      const qParts = collection(db, `service_requests/${viewingRequest.id}/parts`);
      const unsubscribeParts = onSnapshot(qParts, (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setViewingRequestParts(data);
      });

      return () => {
        unsubscribeLogs();
        unsubscribeParts();
      };
    } else {
      setViewingRequestLogs([]);
      setViewingRequestParts([]);
    }
  }, [viewingRequest?.id]);

  const handleAddLog = async () => {
    if (!newLogNote.trim() || !viewingRequest) return;
    setIsAddingLog(true);
    try {
      await addDoc(collection(db, `service_requests/${viewingRequest.id}/logs`), {
        note: newLogNote,
        technician_id: user.id,
        technician_name: user.name,
        is_important: isLogImportant ? 1 : 0,
        is_responded: 0,
        created_at: serverTimestamp()
      });

      // Update redundant indicator on service request if important
      const updateData: any = {
        updated_at: serverTimestamp()
      };
      if (isLogImportant) {
        updateData.has_urgent_pending = (viewingRequest.has_urgent_pending || 0) + 1;
      }
      await updateDoc(doc(db, 'service_requests', viewingRequest.id), updateData);

      setNewLogNote('');
      setIsLogImportant(false);
      toast.success('Service log added successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `service_requests/${viewingRequest.id}/logs`);
    } finally {
      setIsAddingLog(false);
    }
  };

  const handleAcknowledgeLog = async (logId: string) => {
    if (!viewingRequest) return;
    try {
      await updateDoc(doc(db, `service_requests/${viewingRequest.id}/logs`, logId), {
        is_responded: 1
      });
      
      const log = viewingRequestLogs.find(l => l.id === logId);
      if (log?.is_important) {
        await updateDoc(doc(db, 'service_requests', viewingRequest.id), {
          has_urgent_pending: Math.max(0, (viewingRequest.has_urgent_pending || 0) - 1)
        });
      }
      toast.success('Note marked as responded');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `service_requests/${viewingRequest.id}/logs/${logId}`);
    }
  };

  const assignTechnician = async (requestId: string, techId: string) => {
    try {
      const tech = technicians.find(t => t.id === techId);
      await updateDoc(doc(db, 'service_requests', requestId), {
        technician_id: techId,
        technician_name: tech?.name || '',
        status: 'ASSIGNED',
        rejection_reason: null,
        operator_id: user.id,
        updated_at: serverTimestamp()
      });

      // Log the assignment
      await addDoc(collection(db, `service_requests/${requestId}/logs`), {
        note: `Technician assigned: ${tech?.name || 'Unknown'}`,
        status: 'ASSIGNED',
        operator_id: user.id,
        operator_name: user.name,
        is_important: 0,
        created_at: serverTimestamp()
      });

      setAssigningId(null);
      toast.success('Technician assigned successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `service_requests/${requestId}`);
    }
  };

  const deleteRequest = async (id: string) => {
    if (!confirm('Are you sure you want to delete this service request?')) return;
    try {
      await deleteDoc(doc(db, 'service_requests', id));
      toast.success('Service request deleted');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `service_requests/${id}`);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;
    
    try {
      const brand = brands.find(b => b.id === editingRequest.brand_id);
      
      // Destructure to remove 'id' and other internal fields we don't want to save back into the body
      const { id, ...updateData } = editingRequest as any;
      
      await updateDoc(doc(db, 'service_requests', id), {
        ...updateData,
        brand_name: brand?.name || editingRequest.brand_name || '',
        operator_id: user.id,
        updated_at: serverTimestamp()
      });

      setEditingRequest(null);
      toast.success('Service request updated successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `service_requests/${editingRequest.id}`);
    }
  };

  const handleUpdateLabor = async (requestId: string, labor: number) => {
    try {
      await updateDoc(doc(db, 'service_requests', requestId), {
        labor_charge: labor,
        updated_at: serverTimestamp()
      });
      toast.success('Labor charge updated');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `service_requests/${requestId}`);
    }
  };

  const updateRequestStatus = async (requestId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'service_requests', requestId), {
        status,
        operator_id: user.id,
        updated_at: serverTimestamp()
      });

      // Log status update
      await addDoc(collection(db, `service_requests/${requestId}/logs`), {
        note: `Status updated to ${status}`,
        status,
        operator_id: user.id,
        operator_name: user.name,
        is_important: 0,
        created_at: serverTimestamp()
      });
      
      if (viewingRequest && viewingRequest.id === requestId) {
        setViewingRequest({ ...viewingRequest, status } as ServiceRequest);
      }
      
      toast.success(`Request status updated to ${status}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `service_requests/${requestId}`);
    }
  };

  const filteredRequests = requests.filter(req => 
    req.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.model.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination logic
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentRequests = filteredRequests.slice(indexOfFirstItem, indexOfLastItem);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const getStatusColor = (status: string, hasRejection?: boolean) => {
    if (hasRejection && status === 'PENDING') return 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/20';
    switch (status) {
      case 'PENDING': return 'bg-zinc-800 text-zinc-400 border-zinc-700';
      case 'ASSIGNED': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'INSPECTION': return 'bg-violet-500/10 text-violet-500 border-violet-500/20';
      case 'APPR-WAIT': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'IN_PROGRESS': return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
      case 'WAITING_PARTS': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'COMPLETED': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'PAID': return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
      case 'CLOSED': return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
      case 'CANCELLED': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      default: return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Service Requests</h1>
          <p className="text-zinc-500 text-sm">Manage and track all customer service units.</p>
        </div>
        <div className="flex items-center gap-3">
          {['ADMIN', 'OPERATOR'].includes(user.role) && (
            <button 
              onClick={() => navigate('/new-request')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Request</span>
            </button>
          )}
          <button 
            onClick={() => {
              setLoading(true);
              // Data will reload via onSnapshot automatically
              setTimeout(() => setLoading(false), 500);
            }}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
            title="Refresh list"
          >
            <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search requests..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-64"
            />
          </div>
          <button className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">SR#</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Device</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status / Assignment</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Charge</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-4 h-16 bg-zinc-900/50"></td>
                  </tr>
                ))
              ) : currentRequests.map((req) => (
                <tr 
                  key={req.id} 
                  onClick={() => setViewingRequest(req)}
                  className={cn(
                    "hover:bg-zinc-800/30 transition-colors group cursor-pointer",
                    req.rejection_reason && req.status === 'PENDING' && "bg-rose-500/[0.08] border-l-2 border-l-rose-500"
                  )}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1.5">
                      <div className="relative inline-flex items-center gap-2">
                        {(req.has_urgent_pending ?? 0) > 0 && (
                          <span className="absolute -left-3 top-1/2 -translate-y-1/2 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
                          </span>
                        )}
                        <span className="text-[10px] w-fit font-mono font-bold text-zinc-400 bg-zinc-800 px-2 py-1 rounded border border-zinc-700">
                          {req.request_number}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {formatDateTime(req.created_at)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{req.customer_name}</span>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border",
                          req.service_type === 'ON_SITE' 
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                            : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                        )}>
                          {req.service_type === 'ON_SITE' ? 'On-site' : 'Walk-in'}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-500">{req.customer_phone}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-300">{req.brand_name} {req.model || (req as any).device_model}</span>
                        {!!req.is_warranty && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] font-black uppercase tracking-tighter">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            Warranty
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500 font-mono">{req.serial_number}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                          getStatusColor(req.status, !!req.rejection_reason)
                        )}>
                          {req.rejection_reason && req.status === 'PENDING' ? 'REJECTED' : req.status}
                        </span>
                        <div className="flex items-center gap-1.5 ml-1">
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            req.priority === 'URGENT' ? "bg-rose-500" :
                            req.priority === 'HIGH' ? "bg-orange-500" :
                            req.priority === 'NORMAL' ? "bg-blue-500" : "bg-zinc-500"
                          )} />
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">{req.priority}</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        {req.technician_id && req.technician_id !== 0 ? (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <UserIcon className="w-3.5 h-3.5 text-zinc-500" />
                            {req.technician_name}
                          </div>
                        ) : (
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            {assigningId === req.id ? (
                              <select 
                                autoFocus
                                onBlur={() => setAssigningId(null)}
                                onChange={(e) => assignTechnician(req.id, e.target.value)}
                                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                              >
                                <option value="">Select Tech</option>
                                {technicians.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            ) : (
                              <button 
                                onClick={() => setAssigningId(req.id)}
                                disabled={!(req.labor_charge > 0 || req.is_warranty === 1)}
                                title={!(req.labor_charge > 0 || req.is_warranty === 1) ? "Please enter labor charge before assigning" : ""}
                                className={cn(
                                  "flex items-center gap-1.5 text-[10px] font-bold transition-colors uppercase tracking-tight",
                                  !(req.labor_charge > 0 || req.is_warranty === 1)
                                    ? "text-zinc-600 cursor-not-allowed"
                                    : "text-blue-500 hover:text-blue-400"
                                )}
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                {req.rejection_reason ? 'Reassign' : 'Assign Technician'}
                              </button>
                            )}
                          </div>
                        )}

                        {req.rejection_reason && req.status === 'PENDING' && (
                          <div className="mt-1 p-2 bg-rose-500/10 rounded-lg border border-rose-500/20 max-w-[200px]">
                            <p className="text-[11px] text-rose-300 leading-tight italic">
                              "{req.rejection_reason}"
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={cn(
                          "text-sm font-black transition-colors",
                          req.is_warranty === 1 ? "text-emerald-400" : "text-white"
                        )}>
                          {formatCurrency(req.is_warranty === 1 ? 0 : (req.labor_charge || 0) + (req.parts_total || 0))} 
                        </span>
                        <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">Total Charge</span>
                        {!!req.is_warranty && (
                          <span className="text-[8px] bg-emerald-500/10 text-emerald-500 px-1 rounded font-black uppercase mt-0.5 border border-emerald-500/20">Warranty</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => setEditingRequest(req)}
                        disabled={req.billing_status === 'PAID'}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors",
                          req.billing_status === 'PAID' 
                            ? "text-zinc-600 cursor-not-allowed" 
                            : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                        )}
                        title={req.billing_status === 'PAID' ? "Cannot edit paid request" : "Edit Request"}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => deleteRequest(req.id)}
                        disabled={req.billing_status === 'PAID'}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors",
                          req.billing_status === 'PAID'
                            ? "text-zinc-600 cursor-not-allowed"
                            : "text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"
                        )}
                        title={req.billing_status === 'PAID' ? "Cannot delete paid request" : "Delete Request"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-zinc-500">
                      <AlertCircle className="w-8 h-8 opacity-20" />
                      <p className="text-sm">No service requests found matching your search.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="text-xs text-zinc-500 font-medium">
            Showing <span className="text-zinc-300">{filteredRequests.length > 0 ? indexOfFirstItem + 1 : 0}</span> to <span className="text-zinc-300">{Math.min(indexOfLastItem, filteredRequests.length)}</span> of <span className="text-zinc-300">{filteredRequests.length}</span> requests
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => paginate(currentPage - 1)}
              disabled={currentPage === 1}
              className={cn(
                "p-1.5 transition-all",
                currentPage === 1 ? "text-zinc-700 cursor-not-allowed" : "text-zinc-400 hover:text-white"
              )}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-1 mx-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((number) => (
                <button
                  key={number}
                  onClick={() => paginate(number)}
                  className={cn(
                    "w-7 h-7 rounded-lg text-[10px] font-black transition-all flex items-center justify-center border",
                    currentPage === number
                      ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20"
                      : "bg-zinc-800 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                  )}
                >
                  {number}
                </button>
              )).slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))}
            </div>

            <button 
              onClick={() => paginate(currentPage + 1)}
              disabled={currentPage === totalPages || totalPages === 0}
              className={cn(
                "p-1.5 transition-all",
                (currentPage === totalPages || totalPages === 0) ? "text-zinc-700 cursor-not-allowed" : "text-zinc-400 hover:text-white"
              )}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* View Modal */}
      <AnimatePresence>
        {viewingRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Request Details</h2>
                <button onClick={() => setViewingRequest(null)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-2xl">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Service Request Number</p>
                    <p className="text-xl font-mono font-black text-blue-500 tracking-tighter">{viewingRequest.request_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Created At</p>
                    <p className="text-sm font-medium text-zinc-300">{formatDateTime(viewingRequest.created_at)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Customer</p>
                    <p className="text-lg font-semibold text-white">{viewingRequest.customer_name}</p>
                    <p className="text-sm text-zinc-400">{viewingRequest.customer_phone}</p>
                    {viewingRequest.customer_address && (
                      <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {viewingRequest.customer_address}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Device</p>
                    <p className="text-lg font-semibold text-white">{viewingRequest.brand_name} {viewingRequest.model || (viewingRequest as any).device_model}</p>
                    <p className="text-sm font-mono text-zinc-400">{viewingRequest.serial_number}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Labor Charge</p>
                    <p className="text-lg font-black text-white">{formatCurrency(viewingRequest.labor_charge || 0)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Down Payment</p>
                    <p className={cn(
                      "text-lg font-black",
                      viewingRequest.down_payment > 0 ? "text-emerald-500" : "text-zinc-500"
                    )}>
                      {formatCurrency(viewingRequest.down_payment || 0)}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Issue Description</p>
                  <p className="text-sm text-zinc-300 bg-zinc-950 p-4 rounded-xl border border-zinc-800 leading-relaxed">
                    {viewingRequest.issue_description}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Accessories</p>
                  <p className="text-sm text-zinc-300 bg-zinc-950 p-3 rounded-xl border border-zinc-800 leading-relaxed italic">
                    {viewingRequest.accessories || 'None listed'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</p>
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                      getStatusColor(viewingRequest.status, !!viewingRequest.rejection_reason)
                    )}>
                      {viewingRequest.status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Priority</p>
                    <p className="text-sm text-zinc-300 capitalize">{viewingRequest.priority.toLowerCase()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Warranty</p>
                    <p className="text-sm text-zinc-300">{viewingRequest.is_warranty ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Service Type</p>
                    <p className="text-sm text-zinc-300">{viewingRequest.service_type === 'ON_SITE' ? 'On-site' : 'Walk-in'}</p>
                  </div>
                </div>
                {viewingRequest.rejection_reason && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <p className="text-xs font-bold text-rose-500 uppercase mb-1">
                      Rejection Reason {viewingRequest.rejected_by_name && `(by ${viewingRequest.rejected_by_name})`}
                    </p>
                    <p className="text-sm text-rose-300 italic">"{viewingRequest.rejection_reason}"</p>
                  </div>
                )}

                {viewingRequest.status === 'COMPLETED' && (
                  <div className="p-6 bg-blue-600/5 border border-blue-500/20 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Labor Charge</h3>
                      <span className="text-[10px] font-bold text-zinc-500">MANUAL ENTRY</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="relative flex-1">
                        <input 
                           type="text"
                           value={formatNumberWithDots(viewingRequest.labor_charge)}
                           disabled={viewingRequest.billing_status === 'PAID'}
                           onChange={(e) => {
                             const val = parseDotNumber(e.target.value);
                             setViewingRequest({...viewingRequest, labor_charge: val});
                           }}
                           onBlur={(e) => handleUpdateLabor(viewingRequest.id, parseDotNumber(e.target.value))}
                           className={cn(
                             "w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all",
                             viewingRequest.billing_status === 'PAID' && "opacity-50 cursor-not-allowed"
                           )}
                           placeholder="0"
                         />
                       </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Parts Cost</p>
                        <p className="text-lg font-mono font-bold text-white">
                          {formatCurrency(viewingRequestParts.reduce((acc, item) => acc + ((item.current_price ?? item.price_at_time) * item.quantity), 0))}
                        </p>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-blue-500/10 flex justify-between items-center">
                      <p className="text-sm font-bold text-blue-400">REMAINING BALANCE</p>
                      <p className="text-2xl font-mono font-black text-blue-500">
                        {formatCurrency(
                          viewingRequest.is_warranty === 1
                            ? 0
                            : ((viewingRequest.labor_charge || 0) + 
                              viewingRequestParts.reduce((acc, item) => acc + ((item.current_price ?? item.price_at_time) * item.quantity), 0)) -
                              (viewingRequest.down_payment || 0)
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {viewingRequestParts.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-zinc-800">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Parts Replaced</p>
                      <span className="text-[10px] font-bold text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">
                        {viewingRequestParts.length} ITEMS
                      </span>
                    </div>
                    <div className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-zinc-900/50 border-b border-zinc-800">
                            <th className="px-4 py-2 font-bold text-zinc-500 uppercase">Part</th>
                            <th className="px-4 py-2 font-bold text-zinc-500 uppercase text-right">Price</th>
                            <th className="px-4 py-2 font-bold text-zinc-500 uppercase text-right">Qty</th>
                            <th className="px-4 py-2 font-bold text-zinc-500 uppercase text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {viewingRequestParts.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-2">
                                <div className="flex flex-col">
                                  <span className="text-white font-medium">{item.name}</span>
                                  <span className="text-[10px] text-zinc-500 font-mono">{item.part_number}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right text-zinc-400 font-mono">
                                {formatCurrency(item.current_price ?? item.price_at_time)}
                              </td>
                              <td className="px-4 py-2 text-right text-zinc-400 font-mono">
                                x{item.quantity}
                              </td>
                              <td className="px-4 py-2 text-right text-white font-bold font-mono">
                                {formatCurrency((item.current_price ?? item.price_at_time) * item.quantity)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-zinc-900/30">
                          <tr>
                            <td colSpan={3} className="px-4 py-3 text-right text-zinc-500 font-bold uppercase tracking-wider text-[10px]">Total Parts Cost</td>
                            <td className="px-4 py-3 text-right text-blue-500 font-black font-mono">
                              {formatCurrency(viewingRequestParts.reduce((acc, item) => acc + ((item.current_price ?? item.price_at_time) * item.quantity), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                <div className="space-y-4 pt-4 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Service Progress Log</p>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setIsLogImportant(!isLogImportant)}
                        className={cn(
                          "flex items-center gap-1 text-[10px] font-bold transition-all px-2 py-0.5 rounded border",
                          isLogImportant 
                            ? "bg-rose-500/10 text-rose-500 border-rose-500/20" 
                            : "text-zinc-600 border-transparent hover:text-zinc-400"
                        )}
                      >
                        <ShieldAlert className="w-3 h-3" />
                        URGENT
                      </button>
                      <button 
                        onClick={handleAddLog}
                        disabled={isAddingLog || !newLogNote.trim()}
                        className={cn(
                          "flex items-center gap-1.5 text-[10px] font-bold transition-all",
                          !newLogNote.trim() 
                            ? "text-zinc-600 cursor-not-allowed" 
                            : "text-blue-500 hover:text-blue-400"
                        )}
                      >
                        <PlusCircle className="w-3 h-3" />
                        {isAddingLog ? 'ADDING...' : 'ADD FOLLOW-UP NOTE'}
                      </button>
                    </div>
                  </div>

                  <textarea 
                    value={newLogNote}
                    onChange={(e) => setNewLogNote(e.target.value)}
                    placeholder="Add follow-up notes or internal updates..."
                    className={cn(
                      "w-full bg-zinc-950 border rounded-xl p-3 text-xs text-zinc-300 focus:outline-none focus:ring-2 min-h-[60px] resize-none transition-all",
                      isLogImportant 
                        ? "border-rose-500/30 focus:ring-rose-500/20" 
                        : "border-zinc-800 focus:ring-blue-500/20"
                    )}
                  />

                  <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                    {viewingRequestLogs.map((log) => (
                      <div key={log.id} className={cn(
                        "rounded-xl p-3 border transition-all",
                        log.is_important 
                          ? "bg-rose-500/10 border-rose-500/20 shadow-lg shadow-rose-900/5" 
                          : "bg-zinc-950/50 border-zinc-800/50"
                      )}>
                        <div className="flex justify-between items-start mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              log.is_important ? "text-rose-500" : "text-blue-500"
                            )}>
                              {formatDateTime(log.created_at)}
                            </span>
                            {log.is_important === 1 && (
                              <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1 text-[8px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded uppercase">
                                  <ShieldAlert className="w-2.5 h-2.5" />
                                  Urgent Update
                                </span>
                                {log.is_responded === 1 ? (
                                  <span className="text-[8px] font-bold text-zinc-500 italic">Responded</span>
                                ) : (
                                  <button 
                                    onClick={() => handleAcknowledgeLog(log.id)}
                                    className="text-[8px] font-bold text-blue-400 hover:text-blue-300 underline underline-offset-2"
                                  >
                                    Mark as Responded
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-500 font-medium">
                            {log.operator_name || log.technician_name}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{log.note}</p>
                      </div>
                    ))}
                    {viewingRequestLogs.length === 0 && (
                      <div className="p-8 text-center border border-dashed border-zinc-800 rounded-xl">
                        <Clock className="w-6 h-6 text-zinc-700 mx-auto mb-2 opacity-50" />
                        <p className="text-xs text-zinc-500">No detailed logs found.</p>
                        {viewingRequest.service_notes && (
                          <div className="mt-4 p-3 bg-zinc-800/30 rounded-lg text-left">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Legacy Note:</p>
                            <p className="text-xs text-zinc-400">{viewingRequest.service_notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
                {viewingRequest.status === 'APPR-WAIT' && (user.role === 'OPERATOR' || user.role === 'ADMIN' || user.role === 'POWER_USER') && (
                  <button 
                    onClick={() => updateRequestStatus(viewingRequest.id, 'IN_PROGRESS')}
                    className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/20"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Customer Approved
                  </button>
                )}
                {viewingRequest.status === 'PAID' && (user.role === 'OPERATOR' || user.role === 'ADMIN' || user.role === 'POWER_USER') && (
                  <button 
                    onClick={() => updateRequestStatus(viewingRequest.id, 'CLOSED')}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20"
                  >
                    <Save className="w-4 h-4" />
                    Mark as Closed (Picked Up)
                  </button>
                )}
                <button 
                  onClick={() => setViewingRequest(null)}
                  className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl"
            >
              <form onSubmit={handleUpdate}>
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Edit Request</h2>
                  <button type="button" onClick={() => setEditingRequest(null)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>
                <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Customer Name</label>
                      <input 
                        type="text"
                        value={editingRequest.customer_name || ''}
                        onChange={(e) => setEditingRequest({...editingRequest, customer_name: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Phone</label>
                      <input 
                        type="text"
                        value={editingRequest.customer_phone || ''}
                        onChange={(e) => setEditingRequest({...editingRequest, customer_phone: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Address</label>
                    <textarea 
                      value={editingRequest.customer_address || ''}
                      onChange={(e) => setEditingRequest({...editingRequest, customer_address: e.target.value})}
                      rows={2}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Brand</label>
                      <select 
                        value={editingRequest.brand_id || ''}
                        onChange={(e) => setEditingRequest({...editingRequest, brand_id: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="" disabled>Select Brand</option>
                        {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Model</label>
                      <input 
                        type="text"
                        value={editingRequest.model || ''}
                        onChange={(e) => setEditingRequest({...editingRequest, model: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Issue Description</label>
                    <textarea 
                      value={editingRequest.issue_description || ''}
                      onChange={(e) => setEditingRequest({...editingRequest, issue_description: e.target.value})}
                      rows={4}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Accessories</label>
                    <input 
                      type="text"
                      value={editingRequest.accessories || ''}
                      onChange={(e) => setEditingRequest({...editingRequest, accessories: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="Eg. Cable, Charger, Case..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Priority</label>
                      <select 
                        value={editingRequest.priority || ''}
                        onChange={(e) => setEditingRequest({...editingRequest, priority: e.target.value as any})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="LOW">Low</option>
                        <option value="NORMAL">Normal</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Labor Charge</label>
                      <input 
                        type="text"
                        value={formatNumberWithDots(editingRequest.labor_charge || 0)}
                        onChange={(e) => setEditingRequest({...editingRequest, labor_charge: parseDotNumber(e.target.value)})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                      />
                     </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Down Payment</label>
                      <input 
                        type="text"
                        value={formatNumberWithDots(editingRequest.down_payment || 0)}
                        onChange={(e) => setEditingRequest({...editingRequest, down_payment: parseDotNumber(e.target.value)})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono text-emerald-400"
                        placeholder="0"
                      />
                      <p className="text-[10px] text-zinc-500 italic">Initial payment confirmed by customer.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Service Type</label>
                      <select 
                        value={editingRequest.service_type || 'WALK_IN'}
                        onChange={(e) => setEditingRequest({...editingRequest, service_type: e.target.value as any})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="WALK_IN">Walk-in</option>
                        <option value="ON_SITE">On-site</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                      <input 
                        type="checkbox"
                        checked={!!editingRequest.is_warranty}
                        onChange={(e) => setEditingRequest({...editingRequest, is_warranty: e.target.checked ? 1 : 0})}
                        className="w-4 h-4 rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-blue-500/20"
                      />
                      <label className="text-sm font-medium text-zinc-400">Under Warranty</label>
                    </div>
                  </div>
                  <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setEditingRequest(null)}
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
