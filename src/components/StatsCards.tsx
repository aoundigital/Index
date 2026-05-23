import { UrlCheckResult } from '../types';
import { Layers, CheckCircle2, AlertTriangle, HelpCircle, Loader, Ban } from 'lucide-react';

interface StatsCardsProps {
  results: UrlCheckResult[];
}

export default function StatsCards({ results }: StatsCardsProps) {
  const stats = results.reduce(
    (acc, cur) => {
      acc.total++;
      if (cur.status === 'pending') acc.pending++;
      else if (cur.status === 'checking') acc.checking++;
      else if (cur.status === 'indexed') acc.indexed++;
      else if (cur.status === 'not_indexed') acc.notIndexed++;
      else if (cur.status === 'error') acc.error++;
      return acc;
    },
    { total: 0, pending: 0, checking: 0, indexed: 0, notIndexed: 0, error: 0 }
  );

  const indexedPercent = stats.total > 0 
    ? Math.round((stats.indexed / stats.total) * 100) 
    : 0;

  const notIndexedPercent = stats.total > 0 
    ? Math.round((stats.notIndexed / stats.total) * 100) 
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 font-sans">
      
      {/* Total Card */}
      <div className="bg-slate-850 border border-slate-700/50 p-4 rounded-xl flex items-center gap-3">
        <div className="p-2.5 bg-slate-700/40 text-slate-300 rounded-lg">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Total Corrente</p>
          <p className="text-xl font-bold text-white shrink-0 leading-tight">{stats.total} <span className="text-xs text-slate-500 font-normal">URLs</span></p>
        </div>
      </div>

      {/* Indexed (Succeeded) Card */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl flex items-center gap-3">
        <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div>
          <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Indexados (GSC)</p>
          <p className="text-xl font-bold text-emerald-400 shrink-0 leading-tight">
            {stats.indexed} 
            {stats.total > 0 && (
              <span className="text-xs text-emerald-500/70 font-normal ml-1.5">({indexedPercent}%)</span>
            )}
          </p>
        </div>
      </div>

      {/* Not Indexed (Blocked / Warning) Card */}
      <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl flex items-center gap-3">
        <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-lg">
          <Ban className="w-5 h-5" />
        </div>
        <div>
          <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Excluídos / Não Ind.</p>
          <p className="text-xl font-bold text-amber-500 shrink-0 leading-tight">
            {stats.notIndexed}
            {stats.total > 0 && (
              <span className="text-xs text-amber-500/70 font-normal ml-1.5">({notIndexedPercent}%)</span>
            )}
          </p>
        </div>
      </div>

      {/* Checking/Processing Card */}
      <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl flex items-center gap-3">
        <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg">
          {stats.checking > 0 ? (
            <Loader className="w-5 h-5 animate-spin" />
          ) : (
            <HelpCircle className="w-5 h-5 text-blue-400/80" />
          )}
        </div>
        <div>
          <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Fila Pendente</p>
          <p className="text-xl font-bold text-blue-300 shrink-0 leading-tight">{stats.pending + stats.checking} <span className="text-xs text-slate-500 font-normal">restantes</span></p>
        </div>
      </div>

      {/* Error Card */}
      <div className="bg-rose-500/5 border border-rose-500/20 col-span-2 lg:col-span-1 p-4 rounded-xl flex items-center gap-3">
        <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-lg">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Erros GSC/Rede</p>
          <p className="text-xl font-bold text-rose-400 shrink-0 leading-tight">{stats.error} <span className="text-xs text-slate-500 font-normal">falhas</span></p>
        </div>
      </div>

    </div>
  );
}
