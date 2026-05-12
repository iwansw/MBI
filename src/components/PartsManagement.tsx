import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Package, 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X,
  Search,
  Upload,
  FileDown,
  Loader2,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Part, Brand } from '../types';
import { cn, formatCurrency, formatNumberWithDots, parseDotNumber } from '../lib/utils';
import { toast } from 'sonner';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, writeBatch, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';

export default function PartsManagement() {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingPart, setIsAddingPart] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [viewingPart, setViewingPart] = useState<Part | null>(null);
  const [newPart, setNewPart] = useState({ part_number: '', name: '', brand: '', description: '', price: '', cogs: '' });
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandSearch, setBrandSearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  useEffect(() => {
    const q = query(collection(db, 'parts'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Part));
      setParts(data);
      setLoading(false);
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
      unsubscribe();
      unsubscribeBrands();
    };
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        if (data.length === 0) {
          toast.error('The selected file is empty');
          setIsImporting(false);
          return;
        }

        // Validate headers roughly
        const requiredFields = ['name'];
        const firstRow = data[0];
        const missingFields = requiredFields.filter(field => !(field in firstRow));

        if (missingFields.length > 0) {
          toast.error(`Missing required columns: ${missingFields.join(', ')}`);
          setIsImporting(false);
          return;
        }

        const batch = writeBatch(db);
        const partsRef = collection(db, 'parts');
        let count = 0;

        for (const item of data) {
          const newDocRef = doc(partsRef);
          batch.set(newDocRef, {
            part_number: String(item.part_number || item.pn || ''),
            name: String(item.name || ''),
            brand: String(item.brand || ''),
            description: String(item.description || ''),
            price: parseFloat(item.price || item.msrp || 0),
            cogs: parseFloat(item.cogs || item.cost || 0),
            created_at: serverTimestamp()
          });
          count++;
          
          // Firestore batches are limited to 500 operations
          if (count % 400 === 0) {
            await batch.commit();
            // Re-initialize batch for next set
          }
        }

        if (count % 400 !== 0) {
          await batch.commit();
        }

        toast.success(`Successfully imported ${count} parts`);
      } catch (err) {
        console.error('Import error:', err);
        toast.error('Failed to import Excel file. Please check the format.');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      toast.error('Failed to read file');
      setIsImporting(false);
    };

    reader.readAsBinaryString(file);
  };

  const handleDownloadTemplate = () => {
    const template = [
      {
        part_number: 'PN-12345',
        name: 'Sample Part Name',
        brand: 'Samsung',
        description: 'Optional description here',
        price: 150000,
        cogs: 100000
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parts Template');
    XLSX.writeFile(wb, 'parts_import_template.xlsx');
  };

  const filteredBrands = useMemo(() => brands.filter(b => 
    b.name.toLowerCase().includes(brandSearch.toLowerCase())
  ), [brands, brandSearch]);

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'parts'), {
        part_number: newPart.part_number,
        name: newPart.name,
        brand: newPart.brand,
        description: newPart.description,
        price: parseFloat(newPart.price) || 0,
        cogs: parseFloat(newPart.cogs) || 0
      });
      setIsAddingPart(false);
      setNewPart({ part_number: '', name: '', brand: '', description: '', price: '', cogs: '' });
      toast.success('Part added to inventory');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'parts');
    }
  };

  const handleUpdatePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPart) return;
    try {
      await updateDoc(doc(db, 'parts', editingPart.id), {
        part_number: editingPart.part_number,
        name: editingPart.name,
        brand: editingPart.brand || '',
        description: editingPart.description || '',
        price: editingPart.price,
        cogs: editingPart.cogs
      });
      setEditingPart(null);
      toast.success('Part updated successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `parts/${editingPart.id}`);
    }
  };

  const handleDeletePart = async (id: string) => {
    if (!confirm('Are you sure you want to delete this part?')) return;
    try {
      await deleteDoc(doc(db, 'parts', id));
      toast.success('Part deleted from inventory');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `parts/${id}`);
    }
  };

  const filteredParts = parts.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.part_number && p.part_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.brand && p.brand.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Pagination logic
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredParts.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredParts.slice(indexOfFirstItem, indexOfLastItem);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Parts Inventory</h1>
          <p className="text-zinc-500 text-sm">Manage replacement parts and pricing.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImport} 
            accept=".xlsx, .xls" 
            className="hidden" 
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input 
              type="text"
              placeholder="Search parts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-64"
            />
          </div>
          <button 
            onClick={handleDownloadTemplate}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
            title="Download Template"
          >
            <FileDown className="w-5 h-5" />
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-bold text-white transition-all border border-zinc-700 disabled:opacity-50"
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Import
          </button>
          <button 
            onClick={() => setIsAddingPart(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" />
            Add Part
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-zinc-950/50 border-bottom border-zinc-800">
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Part Information</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">COGS</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">MSRP</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              [1,2,3].map(i => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={4} className="px-6 py-4 h-16 bg-zinc-900/50"></td>
                </tr>
              ))
            ) : currentItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                  No parts found.
                </td>
              </tr>
            ) : currentItems.map((part) => (
              <tr key={part.id} className="hover:bg-zinc-800/30 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-zinc-500 text-[10px] uppercase tracking-tighter bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                          {part.part_number || '-'}
                        </span>
                        {part.brand && (
                          <span className="text-[10px] bg-blue-600/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 uppercase font-black">
                            {part.brand}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                        {part.name}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-zinc-400 font-mono">
                  {formatCurrency(part.cogs)}
                </td>
                <td className="px-6 py-4 text-sm font-bold text-blue-500">
                  {formatCurrency(part.price)}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setViewingPart(part)}
                      className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-400 transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        setEditingPart(part);
                        setBrandSearch(part.brand || '');
                      }}
                      className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeletePart(part.id)}
                      className="p-2 hover:bg-rose-500/10 rounded-lg text-zinc-400 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredParts.length > 0 && (
        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-4">
          <div className="text-xs text-zinc-500 font-medium">
            Showing <span className="text-zinc-300">{indexOfFirstItem + 1}</span> to <span className="text-zinc-300">{Math.min(indexOfLastItem, filteredParts.length)}</span> of <span className="text-zinc-300 font-bold text-blue-500">{filteredParts.length}</span> parts
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => paginate(currentPage - 1)}
                disabled={currentPage === 1}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                  currentPage === 1
                    ? "bg-zinc-950 border-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                )}
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((number) => (
                  <button
                    key={number}
                    onClick={() => paginate(number)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center border",
                      currentPage === number
                        ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700/50"
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
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                  currentPage === totalPages
                    ? "bg-zinc-950 border-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                )}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* View Part Modal */}
      <AnimatePresence>
        {viewingPart && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Part Details</h2>
                    <p className="text-zinc-500 text-xs">Complete specification</p>
                  </div>
                </div>
                <button onClick={() => setViewingPart(null)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Part Number</p>
                    <p className="text-sm font-mono text-white">{viewingPart.part_number || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Brand</p>
                    <p className="text-sm text-white">{viewingPart.brand || 'N/A'}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Part Name</p>
                  <p className="text-base font-semibold text-white">{viewingPart.name}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Description</p>
                  <p className="text-sm text-zinc-400 leading-relaxed italic">
                    {viewingPart.description || 'No additional description provided.'}
                  </p>
                </div>

                <div className="pt-6 border-t border-zinc-800 grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Cost (COGS)</p>
                    <p className="text-lg font-mono text-zinc-500">{formatCurrency(viewingPart.cogs || 0)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Selling Price (MSRP)</p>
                    <p className="text-xl font-mono text-blue-500 font-bold">{formatCurrency(viewingPart.price || 0)}</p>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-zinc-950 border-t border-zinc-800 flex justify-end">
                <button 
                  onClick={() => setViewingPart(null)}
                  className="px-8 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg"
                >
                  Close Detail
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Part Modal */}
      <AnimatePresence>
        {isAddingPart && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <form onSubmit={handleAddPart}>
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Add New Part</h2>
                  <button type="button" onClick={() => setIsAddingPart(false)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>
                <div className="p-8 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Part Number</label>
                      <input 
                        type="text"
                        required
                        value={newPart.part_number}
                        onChange={(e) => setNewPart({...newPart, part_number: e.target.value})}
                        placeholder="e.g. PN-12345"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="space-y-2 relative">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Brand</label>
                      <input 
                        type="text"
                        value={newPart.brand || brandSearch}
                        onChange={(e) => {
                          setBrandSearch(e.target.value);
                          setNewPart({...newPart, brand: e.target.value});
                          setShowBrandDropdown(true);
                        }}
                        onFocus={() => setShowBrandDropdown(true)}
                        placeholder="Select or type Brand..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      {showBrandDropdown && filteredBrands.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                          {filteredBrands.map(b => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                setNewPart({...newPart, brand: b.name});
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
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Part Name</label>
                    <div className="relative">
                      <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        type="text"
                        required
                        value={newPart.name}
                        onChange={(e) => setNewPart({...newPart, name: e.target.value})}
                        placeholder="e.g. LCD Screen 15.6"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Description</label>
                    <textarea 
                      value={newPart.description}
                      onChange={(e) => setNewPart({...newPart, description: e.target.value})}
                      placeholder="Brief specification or notes..."
                      rows={2}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">COGS (Cost)</label>
                       <div className="relative">
                         <input 
                           type="text"
                           required
                           value={formatNumberWithDots(newPart.cogs)}
                           onChange={(e) => setNewPart({...newPart, cogs: parseDotNumber(e.target.value).toString()})}
                           placeholder="0"
                           className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                         />
                       </div>
                     </div>
                     <div className="space-y-2">
                       <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">MSRP (Price)</label>
                       <div className="relative">
                         <input 
                           type="text"
                           required
                           value={formatNumberWithDots(newPart.price)}
                           onChange={(e) => setNewPart({...newPart, price: parseDotNumber(e.target.value).toString()})}
                           placeholder="0"
                           className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                         />
                       </div>
                     </div>
                  </div>
                </div>
                <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsAddingPart(false)}
                    className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-blue-600/20"
                  >
                    <Save className="w-4 h-4" />
                    Save Part
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Part Modal */}
      <AnimatePresence>
        {editingPart && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <form onSubmit={handleUpdatePart}>
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Edit Part</h2>
                  <button type="button" onClick={() => setEditingPart(null)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>
                <div className="p-8 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Part Number</label>
                      <input 
                        type="text"
                        required
                        value={editingPart.part_number || ''}
                        onChange={(e) => setEditingPart({...editingPart, part_number: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="space-y-2 relative">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Brand</label>
                      <input 
                        type="text"
                        value={editingPart.brand || brandSearch}
                        onChange={(e) => {
                          setBrandSearch(e.target.value);
                          setEditingPart({...editingPart, brand: e.target.value});
                          setShowBrandDropdown(true);
                        }}
                        onFocus={() => setShowBrandDropdown(true)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      {showBrandDropdown && filteredBrands.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                          {filteredBrands.map(b => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                setEditingPart({...editingPart, brand: b.name});
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
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Part Name</label>
                    <div className="relative">
                      <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        type="text"
                        required
                        value={editingPart.name || ''}
                        onChange={(e) => setEditingPart({...editingPart, name: e.target.value})}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Description</label>
                    <textarea 
                      value={editingPart.description || ''}
                      onChange={(e) => setEditingPart({...editingPart, description: e.target.value})}
                      rows={2}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">COGS (Cost)</label>
                       <div className="relative">
                         <input 
                           type="text"
                           required
                           value={formatNumberWithDots(editingPart.cogs ?? '')}
                           onChange={(e) => setEditingPart({...editingPart, cogs: parseDotNumber(e.target.value)})}
                           placeholder="0"
                           className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                         />
                       </div>
                     </div>
                     <div className="space-y-2">
                       <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">MSRP (Price)</label>
                       <div className="relative">
                         <input 
                           type="text"
                           required
                           value={formatNumberWithDots(editingPart.price ?? '')}
                           onChange={(e) => setEditingPart({...editingPart, price: parseDotNumber(e.target.value)})}
                           placeholder="0"
                           className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                         />
                       </div>
                     </div>
                  </div>
                </div>
                <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setEditingPart(null)}
                    className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-blue-600/20"
                  >
                    <Save className="w-4 h-4" />
                    Update Part
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
