import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { 
  Wrench, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Package, 
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  X,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Save,
  Search,
  Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, ServiceRequest, Part, ServicePart, ServiceLog, Brand } from '../types';
import { cn, formatCurrency, formatDateTime, formatNumberWithDots, parseDotNumber } from '../lib/utils';
import { toast } from 'sonner';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, where, doc, updateDoc, deleteDoc, addDoc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore';

export default function TechnicianView({ user }: { user: User }) {
  const [jobs, setJobs] = useState<ServiceRequest[]>([]);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingJob, setEditingJob] = useState<ServiceRequest | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'service_requests'), orderBy('created_at', 'desc'));
    const unsubscribeJobs = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ServiceRequest));
      
      const myJobs = data.filter(job => 
        job.technician_id === user.id || 
        (user.role === 'ADMIN' && job.status === 'PENDING')
      );
      setJobs(myJobs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'service_requests');
    });

    const unsubscribeParts = onSnapshot(collection(db, 'parts'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Part));
      setParts(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'parts');
    });

    const unsubscribeBrands = onSnapshot(collection(db, 'brands'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Brand));
      setBrands(data);
    });

    return () => {
      unsubscribeJobs();
      unsubscribeParts();
      unsubscribeBrands();
    };
  }, [user.id, user.role]);

  const updateStatus = async (jobId: string, status: string, unassign: boolean = false, reason: string = '') => {
    try {
      await updateDoc(doc(db, 'service_requests', jobId), { 
        status, 
        technician_id: unassign ? null : user.id,
        rejection_reason: reason || null,
        operator_id: user.id,
        updated_at: serverTimestamp()
      });

      // Add progress log
      await addDoc(collection(db, `service_requests/${jobId}/logs`), {
        note: status === 'PENDING' && unassign 
          ? `Job rejected: ${reason}` 
          : `Status updated to ${status}`,
        status,
        operator_id: user.id,
        operator_name: user.name,
        is_important: (status === 'PENDING' && unassign) ? 1 : 0,
        created_at: serverTimestamp()
      });

      toast.success(`Job status updated to ${status}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `service_requests/${jobId}`);
    }
  };

  const updateNotes = async (jobId: string, notes: string) => {
    try {
      await updateDoc(doc(db, 'service_requests', jobId), { 
        service_notes: notes, 
        operator_id: user.id,
        updated_at: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `service_requests/${jobId}`);
    }
  };

  const addPartToJob = async (jobId: string, partId: string, quantity: number = 1) => {
    const part = parts.find(p => p.id === partId);
    if (!part) return;

    try {
      await addDoc(collection(db, `service_requests/${jobId}/parts`), {
        part_id: partId,
        name: part.name,
        brand: part.brand || '',
        part_number: part.part_number,
        quantity,
        price_at_time: part.price,
        created_at: serverTimestamp()
      });
      
      // Update parts_total on service_request
      const partsSnap = await getDocs(collection(db, `service_requests/${jobId}/parts`));
      const total = partsSnap.docs.reduce((acc, d) => acc + ((d.data().price_at_time || 0) * (d.data().quantity || 0)), 0);
      await updateDoc(doc(db, 'service_requests', jobId), { 
        parts_total: total,
        updated_at: serverTimestamp()
      });
      
      toast.success('Part added to job');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `service_requests/${jobId}/parts`);
    }
  };

  const removePartFromJob = async (jobId: string, partItemId: string) => {
    try {
      await deleteDoc(doc(db, `service_requests/${jobId}/parts`, partItemId));
      
      // Update parts_total on service_request
      const partsSnap = await getDocs(collection(db, `service_requests/${jobId}/parts`));
      const total = partsSnap.docs.reduce((acc, d) => acc + ((d.data().price_at_time || 0) * (d.data().quantity || 0)), 0);
      await updateDoc(doc(db, 'service_requests', jobId), { 
        parts_total: total,
        updated_at: serverTimestamp()
      });

      toast.success('Part removed from job');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `service_requests/${jobId}/parts/${partItemId}`);
    }
  };

  const handleUpdateJob = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingJob) return;
    
    try {
      await updateDoc(doc(db, 'service_requests', editingJob.id), {
        serial_number: editingJob.serial_number,
        model: editingJob.model,
        issue_description: editingJob.issue_description,
        accessories: editingJob.accessories,
        operator_id: user.id,
        updated_at: serverTimestamp()
      });
      setEditingJob(null);
      toast.success('Job details updated');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `service_requests/${editingJob.id}`);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">My Service Jobs</h1>
        <p className="text-zinc-500 text-sm">Manage your assigned units and track parts replacement.</p>
      </div>

      <div className="space-y-4">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-24 bg-zinc-900 rounded-2xl animate-pulse"></div>)
        ) : jobs.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
            <Wrench className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-white font-semibold">No active jobs</h3>
            <p className="text-zinc-500 text-sm mt-1">You don't have any service units assigned to you at the moment.</p>
          </div>
        ) : jobs.map((job) => (
          <JobCard 
            key={job.id} 
            job={job} 
            user={user}
            isExpanded={expandedJob === job.id}
            onToggle={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
            onStatusUpdate={(status: any, unassign: any, reason: any) => updateStatus(job.id, status, unassign, reason)}
            onUpdateNotes={(notes: any) => updateNotes(job.id, notes)}
            parts={parts}
            onAddPart={(partId: any, quantity: any) => addPartToJob(job.id, partId, quantity)}
            onRemovePart={removePartFromJob}
            brands={brands}
            onEdit={() => setEditingJob(job)}
          />
        ))}
      </div>

      {/* Technician Edit Modal */}
      <AnimatePresence>
        {editingJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <form onSubmit={handleUpdateJob}>
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Update Job Details</h2>
                  <button type="button" onClick={() => setEditingJob(null)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>
                <div className="p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Model Name</label>
                    <input 
                      type="text"
                      value={editingJob.model || ''}
                      onChange={(e) => setEditingJob({...editingJob, model: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Serial Number</label>
                    <input 
                      type="text"
                      value={editingJob.serial_number || ''}
                      onChange={(e) => setEditingJob({...editingJob, serial_number: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Issue Description</label>
                    <textarea 
                      value={editingJob.issue_description || ''}
                      onChange={(e) => setEditingJob({...editingJob, issue_description: e.target.value})}
                      rows={4}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Accessories</label>
                    <input 
                      type="text"
                      value={editingJob.accessories || ''}
                      onChange={(e) => setEditingJob({...editingJob, accessories: e.target.value})}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
                <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setEditingJob(null)}
                    className="px-6 py-2 text-zinc-400 hover:text-white font-bold"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex items-center gap-2 px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
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

function JobCard({ job, user, isExpanded, onToggle, onStatusUpdate, onUpdateNotes, parts, onAddPart, onRemovePart, brands, onEdit }: any) {
  const [jobParts, setJobParts] = useState<ServicePart[]>([]);
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isLogImportant, setIsLogImportant] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isAddingPartMenuOpen, setIsAddingPartMenuOpen] = useState(false);
  const [isCreatingNewPart, setIsCreatingNewPart] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [newPartPrice, setNewPartPrice] = useState('');
  const [newPartNumber, setNewPartNumber] = useState('');
  const [newPartBrand, setNewPartBrand] = useState('');
  const [newPartDescription, setNewPartDescription] = useState('');
  const [isSavingNewPart, setIsSavingNewPart] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [partSearchTerm, setPartSearchTerm] = useState('');
  const [partQuantity, setPartQuantity] = useState(1);

  useEffect(() => {
    if (isExpanded) {
      const unsubscribeParts = onSnapshot(collection(db, `service_requests/${job.id}/parts`), (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ServicePart));
        setJobParts(data);
      });

      const qLogs = query(collection(db, `service_requests/${job.id}/logs`), orderBy('created_at', 'desc'));
      const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ServiceLog));
        setLogs(data);
      });

      return () => {
        unsubscribeParts();
        unsubscribeLogs();
      };
    }
  }, [isExpanded, job.id]);

  const handleAddPart = async (partId: string, quantity: number = 1) => {
    await onAddPart(partId, quantity);
    setPartQuantity(1);
    setIsAddingPartMenuOpen(false);
    setPartSearchTerm('');
  };

  const handleRemovePart = async (partId: string) => {
    await onRemovePart(job.id, partId);
  };

  const handleStatusUpdate = async (status: string) => {
    await onStatusUpdate(status);
  };

  const handleAcknowledgeLog = async (logId: string) => {
    try {
      await updateDoc(doc(db, `service_requests/${job.id}/logs`, logId), {
        is_responded: 1
      });
      
      const log = logs.find(l => l.id === logId);
      if (log?.is_important) {
        await updateDoc(doc(db, 'service_requests', job.id), {
          has_urgent_pending: Math.max(0, (job.has_urgent_pending || 0) - 1)
        });
      }
      toast.success('Note acknowledged');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `service_requests/${job.id}/logs/${logId}`);
    }
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) return;
    onStatusUpdate('PENDING', true, rejectionReason);
    setIsRejecting(false);
    setRejectionReason('');
  };

  const handleSaveNotes = async () => {
    if (!notes.trim()) return;
    setIsSavingNotes(true);
    try {
      await addDoc(collection(db, `service_requests/${job.id}/logs`), {
        note: notes,
        technician_id: user.id,
        technician_name: user.name,
        is_important: isLogImportant ? 1 : 0,
        is_responded: 0,
        created_at: serverTimestamp()
      });

      if (isLogImportant) {
        await updateDoc(doc(db, 'service_requests', job.id), {
          has_urgent_pending: (job.has_urgent_pending || 0) + 1
        });
      }

      setNotes('');
      setIsLogImportant(false);
      onUpdateNotes(job.id, notes);
      toast.success('Service log added');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `service_requests/${job.id}/logs`);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleCreateNewPart = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPartName || !newPartPrice) return;
    setIsSavingNewPart(true);
    try {
      const docRef = await addDoc(collection(db, 'parts'), {
        part_number: newPartNumber,
        name: newPartName,
        brand: newPartBrand,
        description: newPartDescription,
        price: parseFloat(newPartPrice)
      });
      
      await handleAddPart(docRef.id, partQuantity);
      setIsCreatingNewPart(false);
      setNewPartName('');
      setNewPartPrice('');
      setNewPartNumber('');
      setNewPartBrand('');
      setNewPartDescription('');
      setPartQuantity(1);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'parts');
    } finally {
      setIsSavingNewPart(false);
    }
  };

  const isAssigned = job.status === 'ASSIGNED';

  const filteredBrands = useMemo(() => brands.filter(b => 
    b.name.toLowerCase().includes(brandSearch.toLowerCase())
  ), [brands, brandSearch]);

  return (
    <div className={cn(
      "bg-zinc-900 border transition-all duration-200 overflow-hidden",
      isExpanded ? "border-blue-500/50 rounded-2xl ring-1 ring-blue-500/20" : "border-zinc-800 rounded-xl hover:border-zinc-700",
      isAssigned && !isExpanded && "border-amber-500/30 bg-amber-500/5"
    )}>
      <div 
        className="p-5 flex items-center justify-between cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            job.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-500" : 
            isAssigned ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-500"
          )}>
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">{job.brand_name} {job.model}</h3>
              {!!job.is_warranty && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] font-black uppercase tracking-tighter">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  Warranty
                </span>
              )}
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                job.service_type === 'ON_SITE' 
                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                  : "bg-blue-500/10 text-blue-500 border-blue-500/20"
              )}>
                {job.service_type === 'ON_SITE' ? 'On-site' : 'Walk-in'}
              </span>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                job.status === 'PENDING' && job.rejection_reason ? "bg-rose-500 text-white border-rose-400" :
                job.status === 'PENDING' ? "bg-zinc-800 text-zinc-400 border-zinc-700" :
                job.status === 'ASSIGNED' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                job.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                "bg-blue-500/10 text-blue-500 border-blue-500/20"
              )}>
                {job.status === 'PENDING' && job.rejection_reason ? 'REJECTED' : job.status}
              </span>
              {job.status === 'PENDING' && job.rejection_reason && job.rejected_by_name && (
                <span className="text-[9px] text-rose-500 font-medium italic">
                  by {job.rejected_by_name}
                </span>
              )}
              {isAssigned && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500 animate-pulse">
                  <AlertTriangle className="w-3 h-3" />
                  ACTION REQUIRED
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="relative inline-flex items-center">
                {(job.has_urgent_pending ?? 0) > 0 && (
                  <span className="absolute -left-3 top-1/2 -translate-y-1/2 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
                  </span>
                )}
                <span className="text-[10px] font-mono font-bold text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                  {job.request_number}
                </span>
              </div>
              <p className="text-xs text-zinc-500">SN: {job.serial_number} • Customer: {job.customer_name}</p>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-600 hover:text-white transition-colors"
                title="Edit Job Info (SN/Model)"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {!isExpanded && isAssigned && (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {isRejecting ? (
                <div className="flex items-center gap-2">
                  <input 
                    type="text"
                    placeholder="Reason..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    autoFocus
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none w-32"
                  />
                  <button 
                    onClick={handleReject}
                    className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setIsRejecting(false)}
                    className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <button 
                    onClick={() => setIsRejecting(true)}
                    className="px-3 py-1 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition-colors"
                  >
                    Reject
                  </button>
                  <button 
                    onClick={() => onStatusUpdate('INSPECTION')}
                    className="px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold transition-colors shadow-lg shadow-violet-600/20"
                  >
                    Accept for Inspection
                  </button>
                </>
              )}
            </div>
          )}
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-zinc-400">Received</p>
            <p className="text-xs text-zinc-600">{formatDateTime(job.created_at)}</p>
          </div>
          {isExpanded ? <ChevronUp className="w-5 h-5 text-zinc-500" /> : <ChevronDown className="w-5 h-5 text-zinc-500" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-5 pb-5 pt-2 border-t border-zinc-800 bg-zinc-950/30">
          {isAssigned && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-500">New Assignment Pending</p>
                  <p className="text-xs text-amber-500/70 mb-3">Please accept this job to start working or provide a reason to reject.</p>
                  {isRejecting ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="text"
                        placeholder="Why are you rejecting this job?"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        autoFocus
                        className="flex-1 bg-zinc-900 border border-amber-500/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                      />
                      <button 
                        onClick={handleReject}
                        className="px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-bold"
                      >
                        Confirm Reject
                      </button>
                      <button 
                        onClick={() => setIsRejecting(false)}
                        className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setIsRejecting(true)}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-500/10 transition-all"
                      >
                        Reject Assignment
                      </button>
                      <button 
                        onClick={() => onStatusUpdate('INSPECTION')}
                        className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-violet-600/20"
                      >
                        Accept for Inspection
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
            {/* Left: Details & Actions */}
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Issue Description</h4>
                <p className="text-sm text-zinc-300 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
                  {job.issue_description}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Accessories</h4>
                <p className="text-sm text-zinc-400 bg-zinc-900/50 p-2 rounded-lg border border-zinc-800 italic leading-relaxed">
                  {job.accessories || 'None'}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Update Status</h4>
                <div className="flex flex-wrap gap-2">
                  {['ASSIGNED', 'INSPECTION', 'APPR-WAIT', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'CANCELLED']
                    .filter(s => {
                      if (user.role === 'TECHNICIAN') {
                        return s !== 'ASSIGNED' && s !== 'CANCELLED';
                      }
                      return true;
                    })
                    .map((s) => (
                    <button
                      key={s}
                      onClick={() => onStatusUpdate(s)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                        job.status === s 
                          ? "bg-blue-600 border-blue-500 text-white" 
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      )}
                    >
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Service Progress Log</h4>
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
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes || !notes.trim()}
                      className={cn(
                        "flex items-center gap-1.5 text-[10px] font-bold transition-all",
                        !notes.trim() 
                          ? "text-zinc-600 cursor-not-allowed" 
                          : "text-emerald-500 hover:text-emerald-400"
                      )}
                    >
                      <Plus className="w-3 h-3" />
                      {isSavingNotes ? 'ADDING...' : 'ADD LOG ENTRY'}
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  <textarea 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Describe progress, actions taken, or issues found..."
                    className={cn(
                      "w-full bg-zinc-900/50 border rounded-xl p-3 text-sm text-zinc-300 focus:outline-none focus:ring-2 min-h-[80px] resize-none transition-all",
                      isLogImportant 
                        ? "border-rose-500/30 focus:ring-rose-500/20" 
                        : "border-zinc-800 focus:ring-blue-500/20"
                    )}
                  />
                  
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {logs.map((log) => (
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
                    {logs.length === 0 && (
                      <div className="p-8 text-center border border-dashed border-zinc-800 rounded-xl">
                        <Clock className="w-6 h-6 text-zinc-700 mx-auto mb-2 opacity-50" />
                        <p className="text-xs text-zinc-500">No progress logs recorded yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Parts Management */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Parts Replaced</h4>
                  <div className="relative">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAddingPartMenuOpen(!isAddingPartMenuOpen);
                      }}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-blue-500 hover:text-blue-400"
                    >
                      <Plus className="w-3 h-3" />
                      ADD PART
                    </button>
                    {isAddingPartMenuOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => {
                            setIsAddingPartMenuOpen(false);
                            setPartSearchTerm('');
                          }}
                        />
                        <div className="absolute right-0 top-full mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-20 p-2">
                          <div className="flex gap-2 mb-2">
                            <div className="relative flex-1">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                              <input 
                                type="text"
                                placeholder="Search parts..."
                                value={partSearchTerm}
                                onChange={(e) => setPartSearchTerm(e.target.value)}
                                autoFocus
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                              />
                            </div>
                            <input 
                              type="number"
                              min="1"
                              value={partQuantity}
                              onChange={(e) => setPartQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-16 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                              title="Quantity"
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1 mb-2">
                            {parts.filter((p: any) => p.name.toLowerCase().includes(partSearchTerm.toLowerCase())).length === 0 ? (
                              <p className="text-[10px] text-zinc-600 p-2 text-center">
                                {parts.length === 0 ? 'No parts in database' : `No matches for "${partSearchTerm}"`}
                              </p>
                            ) : parts.filter((p: any) => p.name.toLowerCase().includes(partSearchTerm.toLowerCase())).map((p: any) => (
                              <button
                                key={p.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddPart(p.id, partQuantity);
                                  setIsAddingPartMenuOpen(false);
                                  setPartSearchTerm('');
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg flex justify-between items-center"
                              >
                                <span>
                                  {p.brand && (
                                    <span className="text-[8px] bg-zinc-800 text-zinc-500 px-1 py-0.5 rounded border border-zinc-700 uppercase font-black mr-2">
                                      {p.brand}
                                    </span>
                                  )}
                                  {p.name} 
                                  <span className="text-[10px] opacity-40 ml-2">{p.part_number}</span>
                                </span>
                                <div className="flex flex-col items-end">
                                  <span className="text-zinc-600 text-[9px]">{formatCurrency(p.price)}</span>
                                  {partQuantity > 1 && <span className="text-blue-500 font-bold text-[9px]">x{partQuantity}</span>}
                                </div>
                              </button>
                            ))}
                          </div>
                          <div className="pt-2 border-t border-zinc-800">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsCreatingNewPart(true);
                                setIsAddingPartMenuOpen(false);
                              }}
                              className="w-full px-3 py-2 text-xs font-bold text-center text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors border border-blue-500/20"
                            >
                              + Create New Part
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {isCreatingNewPart && (
                      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                          <form onSubmit={handleCreateNewPart}>
                            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                              <h3 className="text-lg font-bold text-white">Add New Part to Database</h3>
                              <button type="button" onClick={() => setIsCreatingNewPart(false)} className="text-zinc-500 hover:text-white">
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                            <div className="p-6 space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-xs font-bold text-zinc-500 uppercase mb-1.5 block">Part Number</label>
                                  <input
                                    type="text"
                                    required
                                    value={newPartNumber || ''}
                                    onChange={(e) => setNewPartNumber(e.target.value || '')}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="e.g. PN-12345"
                                  />
                                </div>
                                <div className="relative">
                                  <label className="text-xs font-bold text-zinc-500 uppercase mb-1.5 block">Brand</label>
                                  <input
                                    type="text"
                                    value={newPartBrand || brandSearch}
                                    onChange={(e) => {
                                      setBrandSearch(e.target.value);
                                      setNewPartBrand(e.target.value);
                                      setShowBrandDropdown(true);
                                    }}
                                    onFocus={() => setShowBrandDropdown(true)}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="Select or type..."
                                  />
                                  {showBrandDropdown && filteredBrands.length > 0 && (
                                    <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                      {filteredBrands.map(b => (
                                        <button
                                          key={b.id}
                                          type="button"
                                          onClick={() => {
                                            setNewPartBrand(b.name);
                                            setBrandSearch(b.name);
                                            setShowBrandDropdown(false);
                                          }}
                                          className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                                        >
                                          {b.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase mb-1.5 block">Part Name</label>
                                <input
                                  type="text"
                                  required
                                  value={newPartName}
                                  onChange={(e) => setNewPartName(e.target.value)}
                                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                  placeholder="e.g. LCD Screen"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase mb-1.5 block">Description</label>
                                <textarea
                                  value={newPartDescription}
                                  onChange={(e) => setNewPartDescription(e.target.value)}
                                  rows={2}
                                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none text-sm"
                                  placeholder="Specs or notes..."
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <label className="text-xs font-bold text-zinc-500 uppercase mb-1.5 block">Price (IDR)</label>
                                   <input
                                     type="text"
                                     required
                                     value={formatNumberWithDots(newPartPrice)}
                                     onChange={(e) => setNewPartPrice(parseDotNumber(e.target.value).toString())}
                                     className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                     placeholder="0"
                                   />
                                 </div>
                                 <div>
                                   <label className="text-xs font-bold text-zinc-500 uppercase mb-1.5 block">Initial Quantity</label>
                                   <input
                                     type="number"
                                     min="1"
                                     required
                                     value={partQuantity}
                                     onChange={(e) => setPartQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                     className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                   />
                                 </div>
                               </div>
                            </div>
                            <div className="p-6 bg-zinc-900/50 border-t border-zinc-800 flex justify-end gap-3">
                              <button 
                                type="button" 
                                onClick={() => setIsCreatingNewPart(false)}
                                className="px-6 py-2 text-zinc-400 hover:text-white font-bold"
                              >
                                Cancel
                              </button>
                              <button 
                                type="submit"
                                disabled={isSavingNewPart}
                                className="px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
                              >
                                {isSavingNewPart ? 'Creating...' : 'Create & Add'}
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 divide-y divide-zinc-800">
                  {jobParts.length === 0 ? (
                    <div className="p-8 text-center">
                      <Package className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs text-zinc-600">No parts added yet</p>
                    </div>
                  ) : jobParts.map((p) => (
                    <div key={p.id} className="p-3 flex items-center justify-between group/part">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center">
                          <Package className="w-4 h-4 text-zinc-500" />
                        </div>
                        <div>
                          <p className="text-sm text-zinc-300 flex items-center gap-2">
                            {p.brand && (
                              <span className="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700 uppercase font-bold tracking-tighter">
                                {p.brand}
                              </span>
                            )}
                            {p.name}
                          </p>
                          <p className="text-[10px] text-zinc-600">PN: {p.part_number || 'N/A'} • Qty: {p.quantity} • {formatCurrency(p.current_price ?? p.price_at_time)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-white">{formatCurrency((p.current_price ?? p.price_at_time) * p.quantity)}</span>
                        <button 
                          onClick={() => handleRemovePart(p.id)}
                          className="p-1.5 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover/part:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {jobParts.length > 0 && (
                    <>
                      <div className="p-3 flex items-center justify-between bg-zinc-900/80">
                        <span className="text-xs font-bold text-zinc-500 uppercase">Total Parts Cost</span>
                        <span className="text-sm font-bold text-blue-500">
                          {formatCurrency(jobParts.reduce((acc, p) => acc + ((p.current_price ?? p.price_at_time) * p.quantity), 0))}
                        </span>
                      </div>
                      <div className="p-3 flex items-center justify-between bg-zinc-900 border-t border-zinc-800">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Grand Total</span>
                          <span className="text-[8px] text-zinc-600 font-medium">Includes Labor: {formatCurrency(job.labor_charge || 0)}</span>
                        </div>
                        <span className="text-lg font-black text-white">
                          {formatCurrency(
                             job.is_warranty === 1
                              ? 0
                              : (job.labor_charge || 0) + 
                                jobParts.reduce((acc, p) => acc + ((p.current_price ?? p.price_at_time) * p.quantity), 0)
                          )}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
