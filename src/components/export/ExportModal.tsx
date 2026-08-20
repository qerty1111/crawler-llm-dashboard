import React, { useState } from 'react';
import { Modal, Button, Badge } from '../ui';
import { usePeriod } from '../../context/PeriodContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { Download, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters?: Record<string, any>;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, filters = {} }) => {
  const { fromIso, toIso, label: periodLabel } = usePeriod();
  const { scoreThreshold } = useAuth();
  const [mode, setMode] = useState<'filtered' | 'all'>('filtered');
  const [isExporting, setIsExporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    setSuccess(false);

    try {
      await api.exportCsv({
        mode,
        from: fromIso,
        to: toIso,
        min_score: filters.min_score !== undefined ? filters.min_score : scoreThreshold,
        max_score: filters.max_score || 10,
        project_id: filters.projectId,
        query_id: filters.queryId,
        domain: filters.domain,
        category: filters.category,
        region: filters.region,
        search: filters.search,
      });

      setSuccess(true);
      setTimeout(() => {
        setIsExporting(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Ошибка формирования выгрузки');
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Экспорт данных в CSV" maxWidth="md">
      <div className="space-y-4 text-slate-200 text-sm">
        <p className="text-xs text-slate-400">
          Файл формируется в формате CSV (UTF-8 с BOM для корректного отображения в Microsoft Excel) с временными метками по часовому поясу Europe/Kyiv.
        </p>

        {/* Mode Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Режим выгрузки</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('filtered')}
              className={`p-3 rounded-xl border text-left transition-all ${
                mode === 'filtered'
                  ? 'border-brand-500 bg-brand-500/10 text-white shadow-sm'
                  : 'border-surface-border bg-surface-light text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-semibold text-xs mb-1 text-brand-300">Текущая выборка</div>
              <div className="text-[11px] text-slate-400">С учётом выбранного периода и активных фильтров</div>
            </button>

            <button
              type="button"
              onClick={() => setMode('all')}
              className={`p-3 rounded-xl border text-left transition-all ${
                mode === 'all'
                  ? 'border-brand-500 bg-brand-500/10 text-white shadow-sm'
                  : 'border-surface-border bg-surface-light text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-semibold text-xs mb-1 text-brand-300">Все подходящие ссылки</div>
              <div className="text-[11px] text-slate-400">Вся база вашего аккаунта (score ≥ {scoreThreshold})</div>
            </button>
          </div>
        </div>

        {/* Details Card */}
        <div className="p-3.5 bg-surface-light rounded-xl border border-surface-border text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-400">Период:</span>
            <span className="font-semibold text-white font-mono">{periodLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Фильтр по оценке:</span>
            <span className="font-semibold text-emerald-400 font-mono">
              score ≥ {mode === 'filtered' && filters.min_score ? filters.min_score : scoreThreshold}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Колонки выгрузки:</span>
            <span className="text-slate-300 text-[11px] text-right font-mono">
              url, domain, title, query_orig, region, category, score, found_at, classified_at, page_tags
            </span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Файл успешно сформирован и скачивается...</span>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Отмена
          </Button>
          <Button variant="primary" onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <span className="animate-spin mr-2">⏳</span> Формирование CSV...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" /> Скачать CSV
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
