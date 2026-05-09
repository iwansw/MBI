import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Save, 
  X, 
  User, 
  Phone, 
  Laptop, 
  Hash, 
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Plus,
  MapPin,
  Box
} from 'lucide-react';
import { Brand, User as SystemUser } from '../types';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, addDoc, doc, runTransaction, query, orderBy, serverTimestamp } from 'firebase/firestore';

export default function ServiceRequestForm({ user }: { user: SystemUser }) {
  const navigate = useNavigate();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    brand_id: '',
    model: '',
    serial_number: '',
    issue_description: '',
    accessories: '',
    priority: 'URGENT',
    service_type: 'WALK_IN',
    is_warranty: false
  });

  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<'name' | 'phone' | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'brands'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Brand));
      setBrands(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Fetch unique customers from service_requests
    const unsubscribe = onSnapshot(collection(db, 'service_requests'), (snapshot) => {
      const uniqueCustomers = new Map();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.customer_phone) {
          uniqueCustomers.set(data.customer_phone, {
            name: data.customer_name,
            phone: data.customer_phone,
            address: data.customer_address
          });
        }
      });
      setCustomers(Array.from(uniqueCustomers.values()));
    });
    return () => unsubscribe();
  }, []);

  const handleSelectCustomer = (customer: any) => {
    setFormData({
      ...formData,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_address: customer.address || ''
    });
    setShowSuggestions(null);
  };

  const filteredCustomersByName = customers.filter(c => 
    formData.customer_name && 
    c.name.toLowerCase().includes(formData.customer_name.toLowerCase()) &&
    c.name.toLowerCase() !== formData.customer_name.toLowerCase()
  ).slice(0, 5);

  const filteredCustomersByPhone = customers.filter(c => 
    formData.customer_phone && 
    c.phone.includes(formData.customer_phone) &&
    c.phone !== formData.customer_phone
  ).slice(0, 5);

  const handleAddBrand = async () => {
    if (!newBrandName.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'brands'), { name: newBrandName.trim() });
      setFormData({ ...formData, brand_id: docRef.id });
      setNewBrandName('');
      setIsAddingBrand(false);
      toast.success(`Brand added successfully`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'brands');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const result = await runTransaction(db, async (transaction) => {
        const requestNumber = `SR-${Date.now()}`;
        const brand = brands.find(b => b.id === formData.brand_id);
        
        const newRequestRef = doc(collection(db, 'service_requests'));
        const logRef = doc(collection(db, `service_requests/${newRequestRef.id}/logs`));
        
        transaction.set(newRequestRef, {
          ...formData,
          brand_name: brand?.name || '',
          request_number: requestNumber,
          status: 'PENDING',
          operator_id: user.id,
          technician_id: null,
          labor_charge: 0,
          down_payment: 0,
          is_warranty: formData.is_warranty ? 1 : 0,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });

        transaction.set(logRef, {
          note: `New service request created: ${requestNumber}`,
          status: 'PENDING',
          operator_id: user.id,
          operator_name: user.name,
          is_important: 0,
          created_at: serverTimestamp()
        });

        return requestNumber;
      });
      
      setSuccess(true);
      toast.success(`Service request created successfully: ${result}`);
      setTimeout(() => navigate('/requests'), 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'service_requests');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">Request Created Successfully</h2>
          <p className="text-zinc-500">Redirecting to request list...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">New Service Request</h1>
        <p className="text-zinc-500 text-sm">Register a new customer unit for service.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Customer Information */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 text-blue-500 mb-2">
            <User className="w-5 h-5" />
            <h2 className="font-semibold">Customer Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 relative">
              <label className="text-sm font-medium text-zinc-400">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input 
                  type="text" 
                  required
                  value={formData.customer_name}
                  onChange={(e) => {
                    setFormData({...formData, customer_name: e.target.value});
                    setShowSuggestions('name');
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(null), 200)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="John Doe"
                />
              </div>
              
              {showSuggestions === 'name' && filteredCustomersByName.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-2 bg-zinc-950/50 border-b border-zinc-800">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Returning Customers</span>
                  </div>
                  {filteredCustomersByName.map((customer, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectCustomer(customer)}
                      className="w-full px-4 py-3 text-left hover:bg-zinc-800 flex items-center justify-between group transition-colors"
                    >
                      <div>
                        <p className="text-sm font-bold text-white group-hover:text-blue-400">{customer.name}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">{customer.phone}</p>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-zinc-600 group-hover:text-blue-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 relative">
              <label className="text-sm font-medium text-zinc-400">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input 
                  type="tel" 
                  required
                  value={formData.customer_phone}
                  onChange={(e) => {
                    setFormData({...formData, customer_phone: e.target.value});
                    setShowSuggestions('phone');
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(null), 200)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              {showSuggestions === 'phone' && filteredCustomersByPhone.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-2 bg-zinc-950/50 border-b border-zinc-800">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Matching Phone</span>
                  </div>
                  {filteredCustomersByPhone.map((customer, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectCustomer(customer)}
                      className="w-full px-4 py-3 text-left hover:bg-zinc-800 flex items-center justify-between group transition-colors"
                    >
                      <div>
                        <p className="text-sm font-bold text-white group-hover:text-blue-400">{customer.phone}</p>
                        <p className="text-[10px] text-zinc-500 font-bold">{customer.name}</p>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-zinc-600 group-hover:text-blue-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-400">Address</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-zinc-600" />
              <textarea 
                value={formData.customer_address}
                onChange={(e) => setFormData({...formData, customer_address: e.target.value})}
                rows={2}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                placeholder="Customer's physical address..."
              />
            </div>
          </div>
        </div>

        {/* Device Information */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 text-indigo-500 mb-2">
            <Laptop className="w-5 h-5" />
            <h2 className="font-semibold">Device Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-400">Brand</label>
                <button 
                  type="button"
                  onClick={() => setIsAddingBrand(!isAddingBrand)}
                  className="text-[10px] font-bold text-blue-500 hover:text-blue-400 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  {isAddingBrand ? 'CANCEL' : 'NEW BRAND'}
                </button>
              </div>
              {isAddingBrand ? (
                <div className="flex gap-2">
                  <input 
                    type="text"
                    autoFocus
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="Brand name..."
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button 
                    type="button"
                    onClick={handleAddBrand}
                    className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
                  >
                    ADD
                  </button>
                </div>
              ) : (
                <select 
                  required
                  value={formData.brand_id}
                  onChange={(e) => setFormData({...formData, brand_id: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Select Brand</option>
                  {brands.map(brand => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">Model Name/Number</label>
              <input 
                type="text" 
                required
                value={formData.model}
                onChange={(e) => setFormData({...formData, model: e.target.value})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="e.g. ROG Strix G15"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">Serial Number</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input 
                  type="text" 
                  required
                  value={formData.serial_number}
                  onChange={(e) => setFormData({...formData, serial_number: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                  placeholder="SN123456789"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-400">Issue Description</label>
            <textarea 
              required
              rows={4}
              value={formData.issue_description}
              onChange={(e) => setFormData({...formData, issue_description: e.target.value})}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
              placeholder="Describe the problem in detail..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-400">Accessories</label>
            <div className="relative">
              <Box className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input 
                type="text" 
                value={formData.accessories}
                onChange={(e) => setFormData({...formData, accessories: e.target.value})}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="e.g. Cable, Charger, Case, Original Box..."
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-zinc-400">Service Type</label>
              <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                {[
                  { value: 'WALK_IN', label: 'Walk-in' },
                  { value: 'ON_SITE', label: 'On-site' }
                ].map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setFormData({...formData, service_type: t.value as any})}
                    className={cn(
                      "px-3 py-1 rounded text-[10px] font-bold transition-all",
                      formData.service_type === t.value 
                        ? "bg-zinc-800 text-white shadow-sm" 
                        : "text-zinc-600 hover:text-zinc-400"
                    )}
                  >
                    {t.label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>



            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  checked={formData.is_warranty}
                  onChange={(e) => setFormData({...formData, is_warranty: e.target.checked})}
                  className="sr-only"
                />
                <div className={cn(
                  "w-10 h-6 rounded-full transition-colors",
                  formData.is_warranty ? "bg-emerald-600" : "bg-zinc-800"
                )}></div>
                <div className={cn(
                  "absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform",
                  formData.is_warranty ? "translate-x-4" : "translate-x-0"
                )}></div>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className={cn("w-4 h-4", formData.is_warranty ? "text-emerald-500" : "text-zinc-600")} />
                <span className="text-sm font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">Under Warranty</span>
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4">
          <button 
            type="button"
            onClick={() => navigate('/requests')}
            className="px-6 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-blue-600/20"
          >
            {submitting ? 'Creating...' : (
              <>
                <Save className="w-4 h-4" />
                Create Service Request
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
