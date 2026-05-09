import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  LayoutGrid, 
  List,
  ChevronLeft,
  ChevronRight,
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  X, 
  Check, 
  AlertCircle 
} from 'lucide-react';
import { Brand } from '../types';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, getDocs } from 'firebase/firestore';

export default function BrandsManagement() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBrandName, setEditBrandName] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  useEffect(() => {
    const q = query(collection(db, 'brands'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Brand));
      setBrands(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'brands');
    });

    return () => unsubscribe();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName.trim()) return;

    try {
      await addDoc(collection(db, 'brands'), {
        name: newBrandName.trim()
      });
      toast.success('Brand added successfully');
      setNewBrandName('');
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'brands');
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editBrandName.trim()) return;

    try {
      await updateDoc(doc(db, 'brands', id), {
        name: editBrandName.trim()
      });
      toast.success('Brand updated');
      setEditingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `brands/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this brand?')) return;

    try {
      // Check for usage
      const q = query(collection(db, 'service_requests'), where('brand_id', '==', id));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        toast.error('Cannot delete brand that is currently assigned to service requests');
        return;
      }

      await deleteDoc(doc(db, 'brands', id));
      toast.success('Brand deleted');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `brands/${id}`);
    }
  };

  const filteredBrands = brands.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredBrands.length / itemsPerPage);
  const paginatedBrands = filteredBrands.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when searching
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text"
              placeholder="Search brands..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
            />
          </div>
          
          <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'list' ? "bg-zinc-800 text-blue-500 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'grid' ? "bg-zinc-800 text-blue-500 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Add Brand
        </button>
      </div>

      <div className="space-y-4">
        {viewMode === 'list' ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
            <table className="w-full text-left">
              <thead className="bg-zinc-950/50 border-b border-zinc-800">
                <tr>
                  <th className="px-8 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Brand Identity</th>
                  <th className="px-8 py-5 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {isAdding && (
                  <tr className="bg-blue-600/5 animate-in fade-in slide-in-from-top-1">
                    <td className="px-8 py-4">
                      <form onSubmit={handleAdd} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-500">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <input 
                          autoFocus
                          type="text"
                          value={newBrandName}
                          onChange={(e) => setNewBrandName(e.target.value)}
                          placeholder="Enter brand name..."
                          className="bg-transparent border-none p-0 focus:ring-0 text-sm font-bold text-white placeholder-zinc-600 w-full"
                        />
                      </form>
                    </td>
                    <td className="px-8 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={handleAdd}
                          className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-all"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setIsAdding(false)}
                          className="p-2 text-zinc-500 hover:bg-zinc-500/10 rounded-xl transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {loading ? (
                  [1, 2, 3].map(i => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-8 py-6 h-16 bg-zinc-900/50"></td>
                      <td className="px-8 py-6 h-16 bg-zinc-900/50"></td>
                    </tr>
                  ))
                ) : paginatedBrands.length === 0 && !isAdding ? (
                  <tr>
                    <td colSpan={2} className="px-8 py-16 text-center">
                      <Building2 className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                      <p className="text-zinc-500 font-medium">No brands found matching your search.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedBrands.map((brand) => (
                    <tr key={brand.id} className="hover:bg-zinc-800/30 transition-all group">
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold group-hover:bg-blue-600/10 group-hover:text-blue-500 transition-all border border-zinc-700">
                            {brand.name.charAt(0)}
                          </div>
                          {editingId === brand.id ? (
                            <input 
                              autoFocus
                              type="text"
                              value={editBrandName}
                              onChange={(e) => setEditBrandName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleUpdate(brand.id)}
                              className="bg-transparent border-none p-0 focus:ring-0 text-sm font-bold text-blue-400 w-full"
                            />
                          ) : (
                            <div>
                              <span className="block font-bold text-white group-hover:text-blue-400 transition-colors">{brand.name}</span>
                              <span className="text-[10px] text-zinc-500">System Brand Database</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingId === brand.id ? (
                            <>
                              <button 
                                onClick={() => handleUpdate(brand.id)}
                                className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-all"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setEditingId(null)}
                                className="p-2 text-zinc-500 hover:bg-zinc-500/10 rounded-xl transition-all"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button 
                                onClick={() => {
                                  setEditingId(brand.id);
                                  setEditBrandName(brand.name);
                                }}
                                className="p-2 text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                title="Edit Brand"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDelete(brand.id)}
                                className="p-2 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                title="Remove Brand"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {isAdding && (
              <div className="bg-blue-600/5 border border-blue-500/20 rounded-2xl p-4 animate-in fade-in zoom-in-95">
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-500">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <input 
                      autoFocus
                      type="text"
                      value={newBrandName}
                      onChange={(e) => setNewBrandName(e.target.value)}
                      placeholder="Brand Name"
                      className="bg-transparent border-none p-0 focus:ring-0 text-sm font-bold text-white placeholder-zinc-600 w-full"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleAdd}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold"
                    >
                      Save
                    </button>
                    <button 
                      onClick={() => setIsAdding(false)}
                      className="px-3 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-xs"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>
            )}

            {loading ? (
              [1, 2, 3, 4].map(i => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 h-32 animate-pulse" />
              ))
            ) : paginatedBrands.length === 0 && !isAdding ? (
              <div className="col-span-full bg-zinc-900 border border-zinc-800 rounded-2xl py-16 text-center">
                <Building2 className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                <p className="text-zinc-500 font-medium">No brands found matching your search.</p>
              </div>
            ) : (
              paginatedBrands.map((brand) => (
                <div 
                  key={brand.id} 
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-blue-500/30 transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => {
                        setEditingId(brand.id);
                        setEditBrandName(brand.name);
                      }}
                      className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDelete(brand.id)}
                      className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-xl text-white font-black border border-zinc-700 group-hover:scale-110 transition-transform">
                      {brand.name.charAt(0)}
                    </div>
                    {editingId === brand.id ? (
                      <div className="flex flex-col gap-2 w-full">
                        <input 
                          autoFocus
                          type="text"
                          value={editBrandName}
                          onChange={(e) => setEditBrandName(e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm font-bold text-center text-blue-400 focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdate(brand.id)} className="flex-1 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold uppercase">Save</button>
                          <button onClick={() => setEditingId(null)} className="px-2 py-1 bg-zinc-800 text-zinc-400 rounded-lg"><X className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors">{brand.name}</h3>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Official Brand</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-zinc-500 font-medium font-mono">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed hover:text-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 flex gap-4 items-start">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white">Integrity Guard Active</h4>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Brands currently linked to active service requests or parts cannot be deleted to maintain historical audit integrity. 
            Renaming a brand will automatically update all associated system records.
          </p>
        </div>
      </div>
    </div>
  );
}
