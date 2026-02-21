import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Upload, 
  Database as DbIcon, 
  LogOut, 
  Plus, 
  Edit2, 
  Trash2, 
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { User, Component } from './types';

// --- Components ---

const Button = ({ className, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) => {
  const variants = {
    primary: 'bg-zinc-900 text-white hover:bg-zinc-800',
    secondary: 'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'bg-transparent text-zinc-600 hover:bg-zinc-100'
  };
  return (
    <button 
      className={cn('px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2', variants[variant], className)} 
      {...props} 
    />
  );
};

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    className={cn('w-full px-4 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all', className)} 
    {...props} 
  />
);

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [view, setView] = useState<'dashboard' | 'admin' | 'login'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Component[]>([]);

  // BOM Preview state
  const [bomPreview, setBomPreview] = useState<{ data: any[], mpnKey: string | null } | null>(null);
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);

  // Admin state
  const [allComponents, setAllComponents] = useState<Component[]>([]);
  const [editingComponent, setEditingComponent] = useState<Partial<Component> | null>(null);

  useEffect(() => {
    if (token) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
        setView('dashboard');
      }
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email');
    const password = formData.get('password');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setView('dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setView('login');
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/components/search?query=${encodeURIComponent(searchQuery)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSearchResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(file);
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/bom/preview', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setBomPreview(data);
      setSuccess('BOM processed. Review the preview below.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadProcessed = async () => {
    if (!uploadingFile) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', uploadingFile);

    try {
      const res = await fetch('/api/bom/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Processed_${uploadingFile.name}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportToDatabase = async () => {
    if (!uploadingFile) return;
    if (!confirm('This will add/update components in your database from this Excel file. Continue?')) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', uploadingFile);

    try {
      const res = await fetch('/api/admin/components/import', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess(data.message);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminComponents = async () => {
    try {
      const res = await fetch('/api/admin/components', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAllComponents(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveComponent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const url = editingComponent?.id 
        ? `/api/admin/components/${editingComponent.id}` 
        : '/api/admin/components';
      const method = editingComponent?.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error);
      }

      setSuccess(editingComponent?.id ? 'Component updated' : 'Component added');
      setEditingComponent(null);
      fetchAdminComponents();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteComponent = async (id: number) => {
    if (!confirm('Are you sure you want to delete this component?')) return;
    try {
      const res = await fetch(`/api/admin/components/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete');
      setSuccess('Component deleted');
      fetchAdminComponents();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="p-8">
            <div className="flex flex-col items-center mb-8">
              <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center mb-4">
                <DbIcon className="text-white w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold text-zinc-900">BOM Pricing System</h1>
              <p className="text-zinc-500 text-sm mt-1">Sign in to manage your components</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Email Address</label>
                <Input name="email" type="email" placeholder="admin@example.com" required />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Password</label>
                <Input name="password" type="password" placeholder="••••••••" required />
              </div>
              
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-zinc-100 text-center">
              <p className="text-xs text-zinc-400">
                Demo Credentials: admin@example.com / admin123
              </p>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-zinc-900 font-sans">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-bottom border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
              <DbIcon className="text-white w-4 h-4" />
            </div>
            <span className="font-bold text-lg tracking-tight">BOM Pricing</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-1 bg-zinc-100 rounded-full px-3 py-1">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-zinc-600">{user?.email}</span>
              {user?.role === 'admin' && (
                <ShieldCheck size={14} className="text-zinc-400 ml-1" />
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant={view === 'dashboard' ? 'primary' : 'ghost'} 
                onClick={() => setView('dashboard')}
                className="text-sm h-9"
              >
                Dashboard
              </Button>
              {user?.role === 'admin' && (
                <Button 
                  variant={view === 'admin' ? 'primary' : 'ghost'} 
                  onClick={() => {
                    setView('admin');
                    fetchAdminComponents();
                  }}
                  className="text-sm h-9"
                >
                  Admin Panel
                </Button>
              )}
              <Button variant="ghost" onClick={handleLogout} className="text-sm h-9 px-2">
                <LogOut size={18} />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {view === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              <div className="grid md:grid-cols-3 gap-8">
                {/* Search Section */}
                <Card className="md:col-span-2 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold">Component Search</h2>
                      <p className="text-zinc-500 text-sm">Search by MPN or description</p>
                    </div>
                    <Search className="text-zinc-300" />
                  </div>

                  <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                    <Input 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="e.g. EEE-FK1H470P" 
                    />
                    <Button type="submit" disabled={loading}>
                      Search
                    </Button>
                  </form>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-zinc-100">
                          <th className="pb-3 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider">MPN</th>
                          <th className="pb-3 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider">Description</th>
                          <th className="pb-3 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider">Make</th>
                          <th className="pb-3 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider text-right">Price (INR)</th>
                          <th className="pb-3 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider text-right">Price (USD)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {searchResults.length > 0 ? (
                          searchResults.map((comp) => (
                            <tr key={comp.id} className="hover:bg-zinc-50 transition-colors group">
                              <td className="py-3 font-mono text-zinc-900">{comp.mpn}</td>
                              <td className="py-3 text-zinc-600 max-w-xs truncate">{comp.description}</td>
                              <td className="py-3 text-zinc-600">{comp.make}</td>
                              <td className="py-3 text-right font-medium">₹{comp.unit_price_inr.toFixed(2)}</td>
                              <td className="py-3 text-right font-medium">${comp.unit_price_usd.toFixed(3)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-zinc-400 italic">
                              {searchQuery ? 'No results found' : 'Enter a query to search components'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Upload Section */}
                <div className="space-y-6">
                  <Card className="p-6 bg-zinc-900 text-white border-none shadow-xl shadow-zinc-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-white/10 rounded-lg">
                        <FileSpreadsheet className="text-white w-5 h-5" />
                      </div>
                      <h2 className="text-lg font-bold">BOM Processor</h2>
                    </div>
                    <p className="text-zinc-400 text-sm mb-6">
                      Upload your BOM Excel file. We'll automatically match MPNs and fill in the pricing for you.
                    </p>
                    
                    <label className="block">
                      <div className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-white/40 hover:bg-white/5 transition-all">
                        <Upload className="mx-auto mb-3 text-zinc-500" />
                        <span className="text-sm font-medium">
                          {uploadingFile ? uploadingFile.name : 'Click to upload .xlsx'}
                        </span>
                        <input 
                          type="file" 
                          className="hidden" 
                          accept=".xlsx,.xls,.csv" 
                          onChange={handleFileUpload}
                          disabled={loading}
                        />
                      </div>
                    </label>

                    {loading && (
                      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
                        <div className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </div>
                    )}

                    {bomPreview && (
                      <div className="mt-6 flex flex-col gap-2">
                        <Button onClick={handleDownloadProcessed} className="w-full bg-white text-zinc-900 hover:bg-zinc-100">
                          Download Processed BOM
                        </Button>
                        {user?.role === 'admin' && (
                          <Button variant="secondary" onClick={handleImportToDatabase} className="w-full bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700">
                            Import Prices to Database
                          </Button>
                        )}
                        <Button variant="ghost" onClick={() => { setBomPreview(null); setUploadingFile(null); }} className="w-full text-zinc-500 hover:text-white hover:bg-white/10">
                          Clear
                        </Button>
                      </div>
                    )}
                  </Card>

                  {success && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-emerald-700 text-sm"
                    >
                      <CheckCircle2 size={18} />
                      {success}
                    </motion.div>
                  )}

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3 text-red-700 text-sm"
                    >
                      <AlertCircle size={18} />
                      {error}
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Preview Table */}
              <AnimatePresence>
                {bomPreview && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                  >
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="text-xl font-bold">BOM Preview</h2>
                          <p className="text-zinc-500 text-sm">Review matched components before downloading</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                            <span className="text-zinc-600">Found: {bomPreview.data.filter(d => d.db_match === 'Found').length}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 bg-zinc-300 rounded-full" />
                            <span className="text-zinc-600">Not Found: {bomPreview.data.filter(d => d.db_match === 'Not Found').length}</span>
                          </div>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left border-b border-zinc-100">
                              <th className="pb-3 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider">MPN (Excel)</th>
                              <th className="pb-3 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider">Match Status</th>
                              <th className="pb-3 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider text-right">DB Price (INR)</th>
                              <th className="pb-3 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider text-right">DB Price (USD)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-50">
                            {bomPreview.data.slice(0, 50).map((row, idx) => (
                              <tr key={idx} className="hover:bg-zinc-50 transition-colors">
                                <td className="py-3 font-mono text-zinc-900">{row[bomPreview.mpnKey || ''] || '-'}</td>
                                <td className="py-3">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                    row.db_match === 'Found' ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                                  )}>
                                    {row.db_match}
                                  </span>
                                </td>
                                <td className="py-3 text-right font-medium">
                                  {row.db_unit_price_inr ? `₹${row.db_unit_price_inr.toFixed(2)}` : '-'}
                                </td>
                                <td className="py-3 text-right font-medium">
                                  {row.db_unit_price_usd ? `$${row.db_unit_price_usd.toFixed(3)}` : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {bomPreview.data.length > 50 && (
                          <div className="mt-4 text-center text-zinc-400 text-xs italic">
                            Showing first 50 rows of {bomPreview.data.length}
                          </div>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold">Component Database</h1>
                  <p className="text-zinc-500">Manage your central pricing repository</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <div className="px-4 py-2 rounded-lg font-medium transition-all active:scale-95 bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50 flex items-center justify-center gap-2">
                      <Upload size={18} />
                      Bulk Import
                    </div>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".xlsx,.xls,.csv" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingFile(file);
                        await handleImportToDatabase();
                        e.target.value = ''; // Reset input
                      }}
                    />
                  </label>
                  <Button onClick={() => setEditingComponent({})}>
                    <Plus size={18} />
                    Add Component
                  </Button>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-8">
                {/* Form Section */}
                <AnimatePresence>
                  {editingComponent && (
                    <motion.div 
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="lg:col-span-1"
                    >
                      <Card className="p-6 sticky top-24">
                        <h3 className="text-lg font-bold mb-6">
                          {editingComponent.id ? 'Edit Component' : 'New Component'}
                        </h3>
                        <form onSubmit={handleSaveComponent} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                              <label className="block text-xs font-semibold text-zinc-500 mb-1">MPN</label>
                              <Input name="mpn" defaultValue={editingComponent.mpn} required />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-semibold text-zinc-500 mb-1">Description</label>
                              <Input name="description" defaultValue={editingComponent.description} />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-zinc-500 mb-1">Category</label>
                              <Input name="category" defaultValue={editingComponent.category} />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-zinc-500 mb-1">Make</label>
                              <Input name="make" defaultValue={editingComponent.make} />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-zinc-500 mb-1">Price (INR)</label>
                              <Input name="unit_price_inr" type="number" step="0.01" defaultValue={editingComponent.unit_price_inr} required />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-zinc-500 mb-1">Price (USD)</label>
                              <Input name="unit_price_usd" type="number" step="0.001" defaultValue={editingComponent.unit_price_usd} required />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-semibold text-zinc-500 mb-1">Source</label>
                              <Input name="source" defaultValue={editingComponent.source} placeholder="e.g. DigiKey" />
                            </div>
                          </div>
                          <div className="flex gap-2 pt-4">
                            <Button type="submit" className="flex-1" disabled={loading}>
                              {loading ? 'Saving...' : 'Save Component'}
                            </Button>
                            <Button variant="secondary" onClick={() => setEditingComponent(null)} type="button">
                              Cancel
                            </Button>
                          </div>
                        </form>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Table Section */}
                <Card className={cn('p-0', editingComponent ? 'lg:col-span-2' : 'lg:col-span-3')}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 border-b border-zinc-100">
                        <tr className="text-left">
                          <th className="px-6 py-4 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider">MPN</th>
                          <th className="px-6 py-4 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider">Info</th>
                          <th className="px-6 py-4 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider text-right">Pricing</th>
                          <th className="px-6 py-4 font-semibold text-zinc-500 uppercase text-[10px] tracking-wider text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {allComponents.map((comp) => (
                          <tr key={comp.id} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-mono font-medium text-zinc-900">{comp.mpn}</div>
                              <div className="text-[10px] text-zinc-400 uppercase tracking-tight mt-0.5">{comp.category}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-zinc-600 max-w-xs truncate">{comp.description}</div>
                              <div className="text-xs text-zinc-400 mt-0.5">{comp.make} • {comp.source}</div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="font-medium">₹{comp.unit_price_inr.toFixed(2)}</div>
                              <div className="text-xs text-zinc-400">${comp.unit_price_usd.toFixed(3)}</div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  className="h-8 w-8 p-0" 
                                  onClick={() => setEditingComponent(comp)}
                                >
                                  <Edit2 size={14} />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => handleDeleteComponent(comp.id)}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
