import { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Search, 
  Download, 
  Printer, 
  CheckCircle2, 
  Clock,
  CreditCard,
  ExternalLink,
  Loader2
} from 'lucide-react';
import Logo from './Logo';
import { User, ServiceRequest, Billing, ServicePart } from '../types';
import { cn, formatCurrency, formatDateTime } from '../lib/utils';
import { toast } from 'sonner';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, setDoc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import jsPDF from 'jspdf';
import { toPng } from 'html-to-image';

export default function BillingView({ user }: { user: User }) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [requests, setRequests] = useState<(ServiceRequest & { billing_status?: string })[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [bill, setBill] = useState<Billing | null>(null);
  const [parts, setParts] = useState<ServicePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    const q = collection(db, 'service_requests');
    const unsubscribeRequests = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ServiceRequest));
      
      const filtered = data.filter((r) => 
        r.status === 'COMPLETED' || 
        r.status === 'IN_PROGRESS' || 
        r.status === 'APPR-WAIT' ||
        r.status === 'PAID' ||
        r.status === 'CLOSED' ||
        (r as any).billing_status === 'PAID'
      );
      setRequests(filtered);
      setLoading(false);
    });

    const unsubscribeSettings = onSnapshot(collection(db, 'settings'), (snapshot) => {
      const data: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data().value;
      });
      setSettings(data);
    });

    return () => {
      unsubscribeRequests();
      unsubscribeSettings();
    };
  }, []);

  const handleSelectRequest = async (req: ServiceRequest) => {
    setSelectedRequest(req);
    setBill(null);
    
    // Fetch existing bill if any
    try {
      const billRef = doc(db, 'billing', req.id);
      const billSnap = await getDoc(billRef);
      if (billSnap.exists()) {
        setBill({ id: billSnap.id, ...billSnap.data() } as Billing);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `billing/${req.id}`);
    }

    // Fetch parts as a snapshot to handle live updates if tech adds parts while billing is open
    const unsubscribeParts = onSnapshot(collection(db, `service_requests/${req.id}/parts`), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ServicePart));
      setParts(data);
    });

    return () => unsubscribeParts();
  };

  const generateInvoice = async () => {
    if (!selectedRequest) return;

    const isQuote = selectedRequest.status === 'APPR-WAIT';

    try {
      const result = await runTransaction(db, async (transaction) => {
        // Counter based on type
        const counterKey = isQuote ? 'quote_counter' : 'invoice_counter';
        const counterDocRef = doc(db, 'settings', counterKey);
        const counterDoc = await transaction.get(counterDocRef);
        
        let newCount = isQuote ? 3001 : 5001;
        const defaultStart = isQuote ? 3000 : 5000;

        if (counterDoc.exists()) {
          newCount = (counterDoc.data().value || defaultStart) + 1;
        }
        transaction.set(counterDocRef, { value: newCount }, { merge: true });
        
        const prefix = isQuote ? 'QT' : 'INV';
        const invoiceNumber = `${prefix}-${newCount}`;
        const partsTotal = parts.reduce((acc, p) => acc + ((p.current_price ?? p.price_at_time) * p.quantity), 0);
        const serviceFee = selectedRequest.labor_charge || 0;
        const subtotal = partsTotal + serviceFee;
        const totalAmount = selectedRequest.is_warranty === 1 ? 0 : subtotal;
        
        const billData = {
          service_request_id: selectedRequest.id,
          service_fee: serviceFee,
          total_amount: totalAmount,
          status: 'UNPAID',
          invoice_number: invoiceNumber,
          type: isQuote ? 'QUOTE' : 'INVOICE',
          created_at: serverTimestamp()
        };
        
        const billRef = doc(db, 'billing', selectedRequest.id);
        transaction.set(billRef, billData);
        
        // Update service request billing status
        transaction.update(doc(db, 'service_requests', selectedRequest.id), {
          billing_status: 'UNPAID',
          updated_at: serverTimestamp()
        });

        // Add progress log
        const logRef = doc(collection(db, `service_requests/${selectedRequest.id}/logs`));
        transaction.set(logRef, {
          note: `${isQuote ? 'Quote' : 'Invoice'} generated: ${invoiceNumber}`,
          status: selectedRequest.status,
          operator_id: user.id || 'system',
          operator_name: user.name || 'System',
          is_important: 1,
          created_at: serverTimestamp()
        });

        return { invoiceNumber, ...billData };
      });

      // For the UI state, replace serverTimestamp with local time until refetch
      const uiResult = { ...result, created_at: new Date().toISOString() };
      setBill({ id: selectedRequest.id, ...uiResult } as any);
      toast.success(`${isQuote ? 'Quote' : 'Invoice'} generated successfully`);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, `billing/${selectedRequest.id}`);
    }
  };

  const markAsPaid = async () => {
    if (!selectedRequest || !bill) return;

    try {
      await updateDoc(doc(db, 'billing', selectedRequest.id), { status: 'PAID' });
      await updateDoc(doc(db, 'service_requests', selectedRequest.id), { 
        status: 'PAID',
        billing_status: 'PAID',
        updated_at: serverTimestamp()
      });
      
      setBill({ ...bill, status: 'PAID' });
      toast.success('Invoice marked as paid');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `billing/${selectedRequest.id}`);
    }
  };

  const handlePrint = () => {
    if (!invoiceRef.current) return;
    
    toast.info('Preparing print document...');
    
    // Create a hidden iframe for printing to handle styles correctly in iframes
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('title', 'Print Frame');
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      toast.error('Could not create print frame');
      return;
    }

    // Get all style tags and link tags to clone the look exactly
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(s => s.outerHTML)
      .join('');

    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>MBI - Print Document</title>
          ${styles}
          <style>
            @media print {
              @page {
                size: A4;
                margin: 0;
              }
              body {
                background: white !important;
                color: black !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .no-print {
                display: none !important;
              }
              .print-area {
                display: block !important;
                width: 210mm !important; /* A4 Width */
                min-height: 297mm !important; /* A4 Height */
                margin: 0 auto !important;
                padding: 10mm !important;
                box-shadow: none !important;
                border: none !important;
                overflow: visible !important;
                background: white !important;
              }
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
            /* Ensure it looks okay in the iframe before print */
            body { background: white; }
          </style>
        </head>
        <body>
          <div class="print-area">
            ${invoiceRef.current.innerHTML}
          </div>
          <script>
            // Ensure all images are loaded before printing
            window.onload = function() {
              setTimeout(() => {
                window.focus();
                window.print();
                setTimeout(() => {
                  window.parent.document.body.removeChild(window.frameElement);
                }, 500);
              }, 1000);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current || !selectedRequest) return;
    
    setIsGeneratingPDF(true);
    const toastId = toast.loading('Generating high-quality PDF...');
    
    try {
      // Small delay to ensure styles are perfectly calculated
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const dataUrl = await toPng(invoiceRef.current, {
        quality: 1.0,
        pixelRatio: 3,
        backgroundColor: '#ffffff',
        cacheBust: true,
        style: {
          borderRadius: '0',
          boxShadow: 'none',
          // Force some basic colors to ensure oklch doesn't break fonts or rendering
          color: '#18181b'
        }
      });
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const img = new Image();
      img.src = dataUrl;
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      const imgWidth = pdfWidth;
      const imgHeight = (img.height * imgWidth) / img.width;
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
      
      const fileName = `${selectedRequest.status === 'APPR-WAIT' ? 'Quote' : 'Invoice'}_${bill?.invoice_number || 'Draft'}_${selectedRequest.customer_name}.pdf`;
      pdf.save(fileName);
      
      toast.success('PDF downloaded successfully', { id: toastId });
    } catch (err: any) {
      console.error('PDF Generation error:', err);
      toast.error(`Failed to generate PDF: ${err.message || 'Unknown error'}. Please use the "Print" button and select "Save as PDF".`, { id: toastId });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left: Request Selection */}
      <div className="lg:col-span-1 space-y-6 no-print">
        <div>
          <h1 className="text-2xl font-bold text-white">Billing & Invoicing</h1>
          <p className="text-zinc-500 text-sm">Generate quotes for approval or invoices for completed units.</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input 
                type="text" 
                placeholder="Search requests..." 
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y divide-zinc-800">
            {requests.map((req) => (
              <button
                key={req.id}
                onClick={() => handleSelectRequest(req)}
                className={cn(
                  "w-full text-left p-4 hover:bg-zinc-800/50 transition-colors flex items-center justify-between group",
                  selectedRequest?.id === req.id ? "bg-blue-500/5 border-l-4 border-blue-500" : "border-l-4 border-transparent"
                )}
              >
                <div>
                  <p className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">{req.customer_name}</p>
                  <p className="text-xs text-zinc-500">{req.brand_name} {req.model}</p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                    req.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                  )}>
                    {req.status}
                  </span>
                  {req.billing_status !== 'NONE' && (
                    <span className={cn(
                      "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter border",
                      req.billing_status === 'PAID' 
                        ? "bg-emerald-500 text-white border-emerald-600 shadow-sm" 
                        : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                    )}>
                      {req.billing_status === 'PAID' ? 'PAID' : 'UNPAID'}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Invoice Preview */}
      <div className="lg:col-span-2">
        {selectedRequest ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between no-print">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <FileText className="w-6 h-6 text-zinc-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedRequest.status === 'APPR-WAIT' ? 'Quote Preview' : 'Invoice Preview'}</h2>
                  <p className="text-xs text-zinc-500">{selectedRequest.status === 'APPR-WAIT' ? 'Review estimate before sending to customer.' : 'Review parts and service fees before generating.'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 no-print">
                {bill ? (
                  <>
                      {bill.status === 'UNPAID' && selectedRequest.status !== 'APPR-WAIT' && (
                        <button 
                          onClick={markAsPaid}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-emerald-600/20"
                        >
                          <CreditCard className="w-4 h-4" />
                          Mark as Paid
                        </button>
                      )}
                    <button 
                      onClick={handlePrint}
                      className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-all"
                    >
                      <Printer className="w-4 h-4" />
                      Print
                    </button>
                    <button 
                      onClick={handleDownloadPDF}
                      disabled={isGeneratingPDF}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGeneratingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {isGeneratingPDF ? 'Generating...' : 'Download PDF'}
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={generateInvoice}
                    className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-emerald-600/20"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {selectedRequest.status === 'APPR-WAIT' ? 'Generate Quote' : 'Generate Invoice'}
                  </button>
                )}
              </div>
            </div>

            <div ref={invoiceRef} className="bg-white text-zinc-900 rounded-2xl shadow-2xl overflow-hidden print-area">
              {/* Invoice Header */}
              <div className="p-10 bg-zinc-50 border-b border-zinc-200 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Logo className="w-10 h-10" />
                    <span className="text-xl font-bold tracking-tight text-zinc-900">{settings.company_name || 'MBI Service Center'}</span>
                  </div>
                  <div className="text-sm text-zinc-500 space-y-1">
                    <p>{settings.company_address || '123 Tech Avenue, Silicon Valley'}</p>
                    <p>{settings.company_email || 'support@mbiservice.com'}</p>
                    <p>{settings.company_phone || '+1 (555) 123-4567'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <h1 className="text-3xl font-black text-zinc-200 uppercase mb-4">{selectedRequest.status === 'APPR-WAIT' ? 'Service Quote' : 'Invoice'}</h1>
                  <div className="space-y-1">
                    <p className="text-sm font-bold">{selectedRequest.status === 'APPR-WAIT' ? 'Quote' : 'Invoice'} #: <span className="text-zinc-500 font-normal">{bill?.invoice_number || 'DRAFT'}</span></p>
                    <p className="text-sm font-bold">Date: <span className="text-zinc-500 font-normal">{formatDateTime(new Date())}</span></p>
                    <p className="text-sm font-bold">Status: <span className={cn("font-bold", bill?.status === 'PAID' ? "text-emerald-600" : "text-amber-600")}>{bill?.status || 'PENDING'}</span></p>
                  </div>
                </div>
              </div>

              {/* Billing Info */}
              <div className="p-10 grid grid-cols-2 gap-10 border-b border-zinc-100">
                <div>
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Bill To</h3>
                  <div className="space-y-1">
                    <p className="font-bold text-lg">{selectedRequest.customer_name}</p>
                    <p className="text-zinc-500">{selectedRequest.customer_phone}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Service Details</h3>
                  <div className="space-y-1">
                    <p className="font-bold">{selectedRequest.brand_name} {selectedRequest.model}</p>
                    <div className="flex flex-col gap-1 mt-1">
                      <p className="text-zinc-500 font-mono text-sm">S/N: {selectedRequest.serial_number}</p>
                      <p className="text-xs inline-block px-2 py-0.5 bg-zinc-100 rounded-full font-bold text-zinc-600 w-fit">
                        {selectedRequest.is_warranty ? 'WARRANTY SERVICE' : 'NON-WARRANTY'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Case Summary */}
              <div className="px-10 py-8 grid grid-cols-2 gap-10 bg-zinc-50/50 border-b border-zinc-100">
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Problem Detailed</h3>
                  <p className="text-sm text-zinc-600 leading-relaxed italic">"{selectedRequest.issue_description}"</p>
                </div>
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Accessories Included</h3>
                  <p className="text-sm text-zinc-600 leading-relaxed italic">{selectedRequest.accessories || 'None listed'}</p>
                </div>
              </div>

              {/* Items Table */}
              <div className="px-10 pb-10">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-zinc-900">
                      <th className="py-4 text-sm font-black uppercase">Description</th>
                      <th className="py-4 text-sm font-black uppercase text-center">Qty</th>
                      <th className="py-4 text-sm font-black uppercase text-right">Price</th>
                      <th className="py-4 text-sm font-black uppercase text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    <tr className="group">
                      <td className="py-6">
                        <p className="font-bold">Labor Charge</p>
                        <p className="text-xs text-zinc-400">Manual labor and service charge</p>
                      </td>
                      <td className="py-6 text-center">1</td>
                      <td className="py-6 text-right">{formatCurrency(selectedRequest.labor_charge)}</td>
                      <td className="py-6 text-right font-bold">{formatCurrency(selectedRequest.labor_charge)}</td>
                    </tr>
                    {parts.map((p) => (
                      <tr key={p.id}>
                        <td className="py-6">
                          <p className="font-bold">{p.name}</p>
                          <p className="text-xs text-zinc-400">Replacement Part</p>
                        </td>
                        <td className="py-6 text-center">{p.quantity}</td>
                        <td className="py-6 text-right">{formatCurrency(p.current_price ?? p.price_at_time)}</td>
                        <td className="py-6 text-right font-bold">{formatCurrency((p.current_price ?? p.price_at_time) * p.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-10 flex justify-end">
                  <div className="w-64 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Subtotal</span>
                      <span className="font-bold">{formatCurrency(parts.reduce((acc, p) => acc + ((p.current_price ?? p.price_at_time) * p.quantity), 0) + (selectedRequest.labor_charge || 0))}</span>
                    </div>
                    {selectedRequest.is_warranty === 1 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">Warranty Deduction</span>
                        <span className="font-bold text-rose-600">-{formatCurrency(parts.reduce((acc, p) => acc + ((p.current_price ?? p.price_at_time) * p.quantity), 0) + (selectedRequest.labor_charge || 0))}</span>
                      </div>
                    )}
                    {selectedRequest.down_payment > 0 && selectedRequest.is_warranty !== 1 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">Down Payment</span>
                        <span className="font-bold text-emerald-600">-{formatCurrency(selectedRequest.down_payment)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Tax (0%)</span>
                      <span className="font-bold">{formatCurrency(0)}</span>
                    </div>
                    <div className="pt-3 border-t-2 border-zinc-900 flex justify-between items-center">
                      <span className="text-lg font-black uppercase">Balance Due</span>
                      <span className="text-2xl font-black text-blue-600">
                        {formatCurrency(
                          selectedRequest.is_warranty === 1 
                            ? 0 
                            : (parts.reduce((acc, p) => acc + ((p.current_price ?? p.price_at_time) * p.quantity), 0) + (selectedRequest.labor_charge || 0)) - (selectedRequest.down_payment || 0)
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-10 bg-zinc-900 text-white flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Payment Method</p>
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-500" />
                    <span className="text-sm">Bank Transfer / Credit Card</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-zinc-500 italic">Thank you for choosing {settings.company_name || 'MBI Service Center'}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-zinc-900/30 border-2 border-dashed border-zinc-800 rounded-3xl p-12 text-center">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6">
              <FileText className="w-10 h-10 text-zinc-700" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No Request Selected</h3>
            <p className="text-zinc-500 max-w-xs">Select a service request from the list to preview and generate a quote or invoice.</p>
          </div>
        )}
      </div>
    </div>
  );
}
