import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  PackageCheck
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
} from 'recharts';
import { User, ServiceRequest, Brand } from '../types';
import { formatCurrency, cn, formatDateTime } from '../lib/utils';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit, getDocs } from 'firebase/firestore';

interface Stats {
  total: number;
  inProgress: number;
  completed: number;
  paid: number;
  closed: number;
  cancelled: number;
  revenue: number;
  brandStats: { name: string; count: number }[];
}

export default function Dashboard({ user }: { user: User }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const qRequests = query(collection(db, 'service_requests'), orderBy('created_at', 'desc'));
    const unsubscribeRequests = onSnapshot(qRequests, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ServiceRequest));
      setRequests(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'service_requests');
    });

    const unsubscribeBrands = onSnapshot(collection(db, 'brands'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Brand));
      setBrands(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'brands');
    });

    const unsubscribeBills = onSnapshot(collection(db, 'billing'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBills(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'billing');
    });

    return () => {
      unsubscribeRequests();
      unsubscribeBrands();
      unsubscribeBills();
    };
  }, []);

  const filteredRequests = useMemo(() => {
    if (user.role === 'TECHNICIAN') {
      return requests.filter(r => r.technician_id === user.id);
    }
    return requests;
  }, [requests, user]);

  const stats = useMemo<Stats>(() => {
    const billMap = new Map<string, any>();
    bills.forEach(b => {
      const reqId = b.service_request_id || b.id;
      if (reqId) billMap.set(reqId, b);
    });

    const stats: Stats = {
      total: filteredRequests.length,
      inProgress: filteredRequests.filter(r => ['PENDING', 'ASSIGNED', 'INSPECTION', 'APPR-WAIT', 'WAITING_PARTS', 'IN_PROGRESS'].includes(r.status)).length,
      completed: filteredRequests.filter(r => r.status === 'COMPLETED').length,
      paid: filteredRequests.filter(r => r.status === 'PAID').length,
      closed: filteredRequests.filter(r => r.status === 'CLOSED').length,
      cancelled: filteredRequests.filter(r => r.status === 'CANCELLED').length,
      revenue: filteredRequests.reduce((acc, r) => {
        const bill = billMap.get(r.id);
        const isSettled = r.status === 'PAID' || r.status === 'CLOSED';
        const isBillPaid = bill?.status === 'PAID';
        
        // Revenue is counted if the job is settled (PAID/CLOSED) 
        // OR if the bill itself is marked as PAID
        if (isSettled || isBillPaid) {
          // If it's still a QUOTE but job is settled, we trust the quote amount
          // but if it's a QUOTE and job is NOT settled, we don't count it as revenue yet
          if (bill?.type === 'QUOTE' && !isSettled) return acc;

          // Determine the amount: Bill total_amount is primary, fallback to request fields
          let amount = 0;
          if (bill && bill.total_amount !== undefined && bill.total_amount !== null) {
            amount = Number(bill.total_amount) || 0;
          } else {
            // Basic fallback from the request document itself
            amount = (Number(r.labor_charge) || 0) + (Number(r.parts_total) || 0);
          }
          
          return acc + amount;
        }
        return acc;
      }, 0),
      brandStats: brands.map(b => ({
        name: b.name,
        count: filteredRequests.filter(r => r.brand_id === b.id).length
      }))
    };
    return stats;
  }, [filteredRequests, brands, bills]);

  const recentRequests = useMemo(() => {
    const getDate = (date: any) => {
      if (!date) return 0;
      if (typeof date.toDate === 'function') return date.toDate().getTime();
      const d = new Date(date);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    return [...filteredRequests]
      .sort((a, b) => {
        const timeA = Math.max(getDate(a.updated_at), getDate(a.created_at));
        const timeB = Math.max(getDate(b.updated_at), getDate(b.created_at));
        return timeB - timeA;
      })
      .slice(0, 5)
      .map(req => {
        const brand = brands.find(b => b.id === req.brand_id);
        return {
          ...req,
          brand_name: brand?.name || 'Unknown Brand'
        };
      });
  }, [filteredRequests, brands]);

  if (loading) return <div className="animate-pulse space-y-8">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[1,2,3,4].map(i => <div key={i} className="h-32 bg-zinc-900 rounded-2xl border border-zinc-800"></div>)}
    </div>
  </div>;

  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#6366f1'];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Welcome back, {user.name}</h1>
        <p className="text-zinc-500">Here's what's happening at MBI Service Center today.</p>
      </div>

      {/* Stats Grid */}
      <div className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4",
        user.role === 'ADMIN' ? "xl:grid-cols-7" : "xl:grid-cols-6"
      )}>
        <StatCard 
          title="Total SR#" 
          value={stats.total} 
          icon={TrendingUp} 
          trend="+12%" 
          trendUp={true}
          color="blue"
          onClick={() => navigate('/requests')}
        />
        <StatCard 
          title="In-Progress" 
          value={stats.inProgress} 
          icon={Clock} 
          trend="+5" 
          trendUp={false}
          color="amber"
          onClick={() => navigate('/requests', { state: { statusFilter: 'IN_PROGRESS_ALL' } })}
        />
        <StatCard 
          title="Completed" 
          value={stats.completed} 
          icon={CheckCircle2} 
          trend="+8%" 
          trendUp={true}
          color="emerald"
          onClick={() => navigate('/requests', { state: { statusFilter: 'COMPLETED' } })}
        />
        <StatCard 
          title="Paid Units" 
          value={stats.paid} 
          icon={CreditCard} 
          trend="+3" 
          trendUp={true}
          color="cyan"
          onClick={() => navigate('/requests', { state: { statusFilter: 'PAID' } })}
        />
        <StatCard 
          title="Closed" 
          value={stats.closed} 
          icon={PackageCheck} 
          trend="0" 
          trendUp={true}
          color="zinc"
          onClick={() => navigate('/requests', { state: { statusFilter: 'CLOSED' } })}
        />
        <StatCard 
          title="Cancelled" 
          value={stats.cancelled} 
          icon={AlertCircle} 
          trend="-2" 
          trendUp={false}
          color="rose"
          onClick={() => navigate('/requests', { state: { statusFilter: 'CANCELLED' } })}
        />
        {user.role === 'ADMIN' && (
          <StatCard 
            title="Revenue" 
            value={formatCurrency(stats.revenue)} 
            icon={ArrowUpRight} 
            trend="+15%" 
            trendUp={true}
            color="indigo"
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Brand Distribution Chart */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Service Volume by Brand</h2>
            <select className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1 text-xs text-zinc-400 focus:outline-none">
              <option>Last 30 Days</option>
              <option>Last 7 Days</option>
            </select>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.brandStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#71717a" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#71717a" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip 
                  cursor={{ fill: '#27272a' }}
                  contentStyle={{ 
                    backgroundColor: '#18181b', 
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stats.brandStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Updated Activity */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Recent Updated Requests</h2>
          <div className="space-y-6">
            {recentRequests.map((req) => (
              <div 
                key={req.id} 
                className="flex items-start gap-4 p-2 -mx-2 rounded-xl hov-bg-zinc-800/50 cursor-pointer transition-all border border-transparent hover:border-zinc-800"
                onClick={() => navigate('/requests', { state: { requestId: req.id } })}
              >
                <div className={cn(
                  "w-2 h-2 rounded-full mt-2",
                  req.status === 'PENDING' ? "bg-amber-500" : 
                  req.status === 'INSPECTION' ? "bg-violet-500" :
                  req.status === 'APPR-WAIT' ? "bg-orange-400" :
                  req.status === 'IN_PROGRESS' ? "bg-indigo-500" :
                  req.status === 'COMPLETED' ? "bg-emerald-500" :
                  req.status === 'PAID' ? "bg-cyan-500" :
                  req.status === 'CLOSED' ? "bg-zinc-500" :
                  req.status === 'CANCELLED' ? "bg-rose-500" : "bg-blue-500"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{req.customer_name}</p>
                  <p className="text-xs text-zinc-500 truncate">{req.brand_name} {req.model || (req as any).device_model}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-zinc-400">{req.status}</p>
                  <p className="text-[10px] text-zinc-600 font-mono flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDateTime(req.updated_at || req.created_at)}
                  </p>
                </div>
              </div>
            ))}
            {recentRequests.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-8">No recent activity</p>
            )}
          </div>
          <button 
            onClick={() => navigate('/requests')}
            className="w-full mt-6 py-2 text-sm font-medium text-blue-500 hover:text-blue-400 transition-colors border-t border-zinc-800 pt-4"
          >
            View All Requests
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, trendUp, color, onClick }: any) {
  const colors: any = {
    blue: "text-blue-500 bg-blue-500/10",
    amber: "text-amber-500 bg-amber-500/10",
    emerald: "text-emerald-500 bg-emerald-500/10",
    indigo: "text-indigo-500 bg-indigo-500/10",
    cyan: "text-cyan-500 bg-cyan-500/10",
    zinc: "text-zinc-500 bg-zinc-500/10",
    rose: "text-rose-500 bg-rose-500/10",
  };

  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-zinc-900 border border-zinc-800 rounded-2xl p-6 transition-all group",
        onClick ? "cursor-pointer hover:border-blue-500/50 hover:bg-zinc-800/50 active:scale-[0.98]" : "hover:border-zinc-700"
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-2 rounded-xl transition-transform group-hover:scale-110 duration-300", colors[color])}>
          <Icon className="w-6 h-6" />
        </div>
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
          trendUp ? "text-emerald-500 bg-emerald-500/10" : "text-rose-500 bg-rose-500/10"
        )}>
          {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {trend}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-white tracking-tight">{value}</h3>
      </div>
    </div>
  );
}
