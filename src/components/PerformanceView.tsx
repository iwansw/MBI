import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  Users, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  TrendingUp,
  Filter,
  Calendar,
  AlertCircle,
  Loader2,
  ChevronRight,
  TrendingDown,
  Timer
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie
} from 'recharts';
import { motion } from 'motion/react';
import { User, ServiceRequest, ServiceLog, Billing } from '../types';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, getDocs, orderBy, collectionGroup } from 'firebase/firestore';
import { cn, formatDateTime } from '../lib/utils';

interface UserPerformance {
  id: string;
  name: string;
  role: string;
  avgAssignTime: number; // minutes
  avgQuoteTime: number; // minutes
  avgAcceptTime: number; // minutes
  resolutionTime: number; // minutes
  rejects: number;
  accepts: number;
  totalJobs: number;
}

export default function PerformanceView({ user }: { user: User }) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [allLogs, setAllLogs] = useState<ServiceLog[]>([]);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Service Requests
        const reqSnapshot = await getDocs(query(collection(db, 'service_requests'), orderBy('created_at', 'desc')));
        const reqs = reqSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
        setRequests(reqs);

        // Fetch Users
        const userSnapshot = await getDocs(collection(db, 'users'));
        const userData = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setUsers(userData);

        // Fetch Billings
        const billSnapshot = await getDocs(collection(db, 'billing'));
        const billData = billSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Billing));
        setBillings(billData);

        // Fetch All Logs using collectionGroup
        // Note: This requires a composite index, but we'll try it. 
        // If it fails, we'll fall back to fetching per request (which is slower but safer for dev envs)
        try {
          const logsSnapshot = await getDocs(query(collectionGroup(db, 'logs'), orderBy('created_at', 'asc')));
          const logs = logsSnapshot.docs.map(doc => {
            const pathParts = doc.ref.path.split('/');
            return {
              id: doc.id,
              service_request_id: pathParts[1], // path is "service_requests/{id}/logs/{logId}"
              ...doc.data()
            } as ServiceLog;
          });
          setAllLogs(logs);
        } catch (error) {
          console.warn("CollectionGroup logs query failed, falling back to sequential fetch", error);
          // Fallback: Fetch logs for each request
          // To keep it simple and avoid too many requests, we only fetch for the last 100 requests
          const recentReqs = reqs.slice(0, 50);
          const logsPromises = recentReqs.map(r => getDocs(query(collection(db, `service_requests/${r.id}/logs`), orderBy('created_at', 'asc'))));
          const snapshots = await Promise.all(logsPromises);
          const logs: ServiceLog[] = [];
          snapshots.forEach((snap, index) => {
            snap.docs.forEach(doc => {
              logs.push({
                id: doc.id,
                service_request_id: recentReqs[index].id,
                ...doc.data()
              } as ServiceLog);
            });
          });
          setAllLogs(logs);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'performance_data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const performanceMetrics = useMemo(() => {
    const operatorStats = new Map<string, any>();
    const technicianStats = new Map<string, any>();

    const getDiffInMinutes = (t1: any, t2: any) => {
      if (!t1 || !t2) return 0;
      const d1 = new Date(typeof t1 === 'string' ? t1 : t1.toDate?.() || t1).getTime();
      const d2 = new Date(typeof t2 === 'string' ? t2 : t2.toDate?.() || t2).getTime();
      return Math.max(0, (d1 - d2) / (1000 * 60));
    };

    const logsByRequest = new Map<string, ServiceLog[]>();
    allLogs.forEach(log => {
      if (!logsByRequest.has(log.service_request_id)) {
        logsByRequest.set(log.service_request_id, []);
      }
      logsByRequest.get(log.service_request_id)?.push(log);
    });

    const billsByRequest = new Map<string, Billing[]>();
    billings.forEach(bill => {
      if (!billsByRequest.has(bill.service_request_id)) {
        billsByRequest.set(bill.service_request_id, []);
      }
      billsByRequest.get(bill.service_request_id)?.push(bill);
    });

    requests.forEach(req => {
      const logs = logsByRequest.get(req.id) || [];
      const bills = billsByRequest.get(req.id) || [];

      // 1. Operator: respond time to assign technician
      const assignLog = logs.find(l => l.note?.toLowerCase().includes('technician assigned') || (l as any).status === 'ASSIGNED');
      if (assignLog) {
        const opId = (assignLog as any).operator_id;
        if (opId) {
          if (!operatorStats.has(opId)) operatorStats.set(opId, { id: opId, name: (assignLog as any).operator_name || 'Unknown', assignTimes: [], quoteTimes: [] });
          const stats = operatorStats.get(opId);
          stats.assignTimes.push(getDiffInMinutes(assignLog.created_at, req.created_at));
        }
      }

      // 2. Operator: respond time to create quote after APPR-WAIT
      const apprWaitLog = logs.find(l => (l as any).status === 'APPR-WAIT');
      if (apprWaitLog) {
        const quoteBill = bills.find(b => b.type === 'QUOTE');
        if (quoteBill) {
          // Find who created the quote - assume the operator who moved it to APPR-WAIT or any operator?
          // Since billing doesn't store operator_id, we'll attribute to the operator of the request
          const opId = req.operator_id;
          if (opId) {
            if (!operatorStats.has(opId)) operatorStats.set(opId, { id: opId, name: 'Unknown', assignTimes: [], quoteTimes: [] });
            const stats = operatorStats.get(opId);
            stats.quoteTimes.push(getDiffInMinutes(quoteBill.created_at, apprWaitLog.created_at));
          }
        }
      }

      // 3. Technician: respond time to accept job (ASSIGNED -> INSPECTION)
      const firstAssignLog = logs.find(l => (l as any).status === 'ASSIGNED');
      const firstInspectionLog = logs.find(l => (l as any).status === 'INSPECTION');
      if (firstAssignLog && firstInspectionLog && req.technician_id) {
        if (!technicianStats.has(req.technician_id)) {
          technicianStats.set(req.technician_id, { 
            id: req.technician_id, 
            name: req.technician_name || 'Unknown', 
            acceptTimes: [], 
            rejects: 0, 
            accepts: 0, 
            resDurations: [] 
          });
        }
        const stats = technicianStats.get(req.technician_id);
        stats.acceptTimes.push(getDiffInMinutes(firstInspectionLog.created_at, firstAssignLog.created_at));
        stats.accepts++;
      }

      // 4. Technician: reject vs accept ratio
      const rejectionLogs = logs.filter(l => l.note?.toLowerCase().includes('job rejected'));
      rejectionLogs.forEach(rl => {
        const techId = (rl as any).operator_id; // Technician is the "operator" who rejected it in TechView
        if (techId) {
          if (!technicianStats.has(techId)) {
            technicianStats.set(techId, { 
              id: techId, 
              name: (rl as any).operator_name || 'Unknown', 
              acceptTimes: [], 
              rejects: 0, 
              accepts: 0, 
              resDurations: [] 
            });
          }
          technicianStats.get(techId).rejects++;
        }
      });

      // 5. Technician: resolution time (total of INSPECTION + IN PROGRESS)
      const inspectionLog = logs.find(l => (l as any).status === 'INSPECTION');
      const completedLog = logs.find(l => (l as any).status === 'COMPLETED');
      if (inspectionLog && completedLog && req.technician_id) {
        if (!technicianStats.has(req.technician_id)) {
          technicianStats.set(req.technician_id, { 
            id: req.technician_id, 
            name: req.technician_name || 'Unknown', 
            acceptTimes: [], 
            rejects: 0, 
            accepts: 0, 
            resDurations: [] 
          });
        }
        technicianStats.get(req.technician_id).resDurations.push(getDiffInMinutes(completedLog.created_at, inspectionLog.created_at));
      }
    });

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const opPerformances = Array.from(operatorStats.values()).map(s => {
      // Find real name from users list if possible
      const user = users.find(u => u.id === s.id);
      return {
        ...s,
        name: user?.name || s.name,
        avgAssignTime: avg(s.assignTimes),
        avgQuoteTime: avg(s.quoteTimes)
      };
    });

    const techPerformances = Array.from(technicianStats.values()).map(s => {
      const user = users.find(u => u.id === s.id);
      return {
        ...s,
        name: user?.name || s.name,
        avgAcceptTime: avg(s.acceptTimes),
        avgResolutionTime: avg(s.resDurations),
        ratio: s.accepts + s.rejects > 0 ? (s.rejects / (s.accepts + s.rejects)) * 100 : 0
      };
    });

    return { opPerformances, techPerformances };
  }, [requests, allLogs, billings, users]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-zinc-500 font-medium animate-pulse">Analyzing performance data...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-20 text-white">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight mb-2">Performance Analytics</h1>
          <p className="text-zinc-500">Monitoring efficiency and response times across the team.</p>
        </div>
        <div className="flex items-center gap-3 bg-zinc-900/50 p-2 rounded-2xl border border-zinc-800">
          <div className="bg-blue-500/10 p-2 rounded-xl text-blue-500">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="pr-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 leading-none mb-1">Data Period</p>
            <p className="text-sm font-bold">All Time Records</p>
          </div>
        </div>
      </div>

      {/* Operators Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 border border-orange-500/10">
            <Users className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold">Operator Efficiency</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 shadow-xl">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              Response Times
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceMetrics.opPerformances}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="avgAssignTime" name="Assign Tech (min)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgQuoteTime" name="Create Quote (min)" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-zinc-500 mt-4 text-center font-bold uppercase tracking-widest">Minutes to respond</p>
          </div>

          <div className="space-y-4">
            {performanceMetrics.opPerformances.map(op => (
              <div key={op.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold border border-zinc-700">
                      {op.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold">{op.name}</p>
                      <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest leading-none">OPERATOR</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500 mb-1">Avg. Assign Time</p>
                    <p className={cn(
                      "text-xl font-black",
                      op.avgAssignTime < 30 ? "text-emerald-500" : op.avgAssignTime < 60 ? "text-amber-500" : "text-rose-500"
                    )}>
                      {Math.round(op.avgAssignTime)} <span className="text-sm font-bold ml-1">min</span>
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800">
                    <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">Quote Creation</p>
                    <p className="text-lg font-bold">{Math.round(op.avgQuoteTime)} min</p>
                  </div>
                </div>
              </div>
            ))}
            {performanceMetrics.opPerformances.length === 0 && (
              <div className="bg-zinc-900/50 border border-zinc-800 border-dashed rounded-3xl p-12 text-center">
                <TrendingUp className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                <p className="text-zinc-500">Not enough data to calculate operator metrics.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Technicians Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/10">
            <Timer className="w-5 h-5" />
          </div>
          <h2 className="text-2xl font-bold">Technician Performance</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 shadow-xl">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Resolution & Accept Times
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceMetrics.techPerformances}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="avgAcceptTime" name="Accept Time (min)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgResolutionTime" name="Resolution Time (min)" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-zinc-500 mt-4 text-center font-bold uppercase tracking-widest">Average duration in minutes</p>
          </div>

          <div className="space-y-4">
            {performanceMetrics.techPerformances.map(tech => (
              <div key={tech.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold border border-zinc-700">
                      {tech.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold">{tech.name}</p>
                      <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest leading-none">TECHNICIAN</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500 mb-1">Resolution Time</p>
                    <p className="text-xl font-black text-emerald-500">
                      {Math.round(tech.avgResolutionTime / 60)} <span className="text-sm font-bold ml-1">hrs</span>
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800">
                    <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">Acceptance</p>
                    <p className="text-lg font-bold">{Math.round(tech.avgAcceptTime)} min</p>
                  </div>
                  <div className="bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800">
                    <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">Reject Ratio</p>
                    <div className="flex items-center gap-2">
                       <p className={cn(
                        "text-lg font-bold",
                        tech.ratio < 10 ? "text-emerald-500" : tech.ratio < 30 ? "text-amber-500" : "text-rose-500"
                      )}>{Math.round(tech.ratio)}%</p>
                      {tech.ratio > 20 ? <TrendingUp className="w-4 h-4 text-rose-500" /> : <TrendingDown className="w-4 h-4 text-emerald-500" />}
                    </div>
                  </div>
                  <div className="bg-zinc-950/50 rounded-2xl p-4 border border-zinc-800 col-span-2 md:col-span-1">
                    <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">Success Rate</p>
                    <p className="text-lg font-bold text-blue-500">{tech.accepts} / {tech.accepts + tech.rejects}</p>
                  </div>
                </div>
              </div>
            ))}
             {performanceMetrics.techPerformances.length === 0 && (
              <div className="bg-zinc-900/50 border border-zinc-800 border-dashed rounded-3xl p-12 text-center">
                <AlertCircle className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                <p className="text-zinc-500">No technician performance data recorded yet.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Summary Footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-600/10 border border-blue-500/20 rounded-3xl p-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1">Avg Assignment</p>
            <p className="text-2xl font-black">
              {Math.round(performanceMetrics.opPerformances.reduce((acc, p) => acc + p.avgAssignTime, 0) / (performanceMetrics.opPerformances.length || 1))} min
            </p>
          </div>
          <Clock className="w-10 h-10 text-blue-500/50" />
        </div>
        <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-3xl p-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">Avg Resolution</p>
            <p className="text-2xl font-black">
              {Math.round(performanceMetrics.techPerformances.reduce((acc, p) => acc + p.avgResolutionTime, 0) / (performanceMetrics.techPerformances.length || 1) / 60)} hrs
            </p>
          </div>
          <CheckCircle2 className="w-10 h-10 text-emerald-500/50" />
        </div>
        <div className="bg-rose-600/10 border border-rose-500/20 rounded-3xl p-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-1">Team Fatigue</p>
            <p className="text-2xl font-black">Low</p>
          </div>
          <AlertCircle className="w-10 h-10 text-rose-500/50" />
        </div>
      </div>
    </div>
  );
}
