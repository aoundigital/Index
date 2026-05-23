import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck, Mail, Key, Eye, EyeOff, AlertTriangle, RefreshCw } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (token: string, user: { username: string; name: string }) => void;
}

// Resilient fetch with automatic retry logic
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 5,
  delay = 1000
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (err) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 1.2);
    }
    throw err;
  }
}

export default function LoginModal({ onLoginSuccess }: LoginModalProps) {
  const [username, setUsername] = useState('admin@empresa.com');
  const [password, setPassword] = useState('gsc-secure-2026');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connectingServer, setConnectingServer] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [serverAuthDetails, setServerAuthDetails] = useState<{ user: string; isUsingDefaultCredentials: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    
    async function initAuthDetails() {
      try {
        setConnectingServer(true);
        setConnectionError(false);
        const response = await fetchWithRetry('/api/auth/details', {}, 6, 1200);
        const data = await response.json();
        
        if (active && data.success) {
          setServerAuthDetails(data);
          setUsername(data.user);
          setConnectingServer(false);
        }
      } catch (err) {
        console.error("Error fetching credentials status after retries:", err);
        if (active) {
          setConnectionError(true);
          setConnectingServer(false);
        }
      }
    }

    initAuthDetails();
    
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetchWithRetry('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      }, 3, 1000);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Credenciais inválidas.');
      }

      // Save to localStorage for persistence
      localStorage.setItem('gsc_session_token', data.token);
      localStorage.setItem('gsc_session_user', JSON.stringify(data.user));

      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Erro ao efetuar login. Verifique sua conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetryConnection = () => {
    setConnectingServer(true);
    setConnectionError(false);
    fetchWithRetry('/api/auth/details', {}, 6, 1200)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setServerAuthDetails(data);
          setUsername(data.user);
          setConnectingServer(false);
        }
      })
      .catch(err => {
        console.error("Retry failed:", err);
        setConnectionError(true);
        setConnectingServer(false);
      });
  };

  if (connectingServer) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
        <div className="text-center space-y-4 relative z-10">
          <RefreshCw className="w-10 h-10 animate-spin text-blue-400 mx-auto" />
          <p className="text-sm font-semibold text-white">Iniciando barramento seguro...</p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Aguardando resposta do servidor do painel GSC (isto pode levar alguns segundos durante a inicialização inicial).
          </p>
        </div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
        <div className="text-center space-y-4 relative z-10 p-6 bg-slate-800/80 backdrop-blur-md rounded-2xl border border-rose-500/30 max-w-md mx-auto shadow-2xl">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto animate-pulse" />
          <h2 className="text-base font-bold text-white">Falha na Conexão com o Servidor</h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            Não foi possível restabelecer contato com a API do servidor após as tentativas padrão. Isso geralmente ocorre se o servidor backend em Cloud Run estiver em modo de inicialização suspensa (cold start).
          </p>
          <div className="pt-2">
            <button
              onClick={handleRetryConnection}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer mx-auto shadow-lg"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Conectar Novamente</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Decorative background blur shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[35rem] h-[35rem] rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-slate-800/85 backdrop-blur-md rounded-2xl shadow-xl border border-slate-700/60 p-8 sm:p-10 relative z-10 animate-fade-in">
        
        {/* Shield icon & branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/30 mb-4 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
            <Lock className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-sans flex items-center gap-2">
            Monitor <span className="text-blue-400 font-medium">GSC Index</span>
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Acesso Restrito ao Sistema de Indexação de URLs
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm rounded-lg flex items-start gap-2 animate-fade-in">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
              Usuário Corporativo
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                <Mail className="w-5 h-5" />
              </span>
              <input
                id="login_username"
                type="text"
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-900/60 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                placeholder="exemplo@suaempresa.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
              Senha de Segurança
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                <Key className="w-5 h-5" />
              </span>
              <input
                id="login_password"
                type={showPassword ? 'text' : 'password'}
                required
                className="w-full pl-10 pr-10 py-3 bg-slate-900/60 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 focus:outline-none"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            id="login-btn"
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm rounded-lg shadow-md transition-all duration-150 uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              <ShieldCheck className="w-5 h-5" />
            )}
            <span>{loading ? 'Autenticando...' : 'Acessar Painel'}</span>
          </button>
        </form>

        {serverAuthDetails?.isUsingDefaultCredentials && (
          <div className="mt-8 pt-6 border-t border-slate-700/50">
            <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-4 text-xs text-blue-300 space-y-1">
              <p className="font-semibold text-blue-200">ℹ️ Acesso de Demonstração / Padrão Ativo:</p>
              <p>O servidor está configurado com as credenciais padrão de segurança de fábrica:</p>
              <div className="mt-2 bg-slate-900/90 p-2 rounded font-mono text-slate-400 leading-relaxed overflow-x-auto text-[10px] space-y-0.5">
                <div><span className="text-blue-400">Usuário:</span> {serverAuthDetails?.user || 'admin@empresa.com'}</div>
                <div><span className="text-blue-400">Senha:</span> gsc-secure-2026</div>
              </div>
              <p className="pt-2 text-[10px] text-slate-400 italic">
                Para alterar estas credenciais no Cloud Run, defina as variáveis de ambiente <code className="text-slate-300">SECURITY_USERNAME</code> e <code className="text-slate-300">SECURITY_PASSWORD</code>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
