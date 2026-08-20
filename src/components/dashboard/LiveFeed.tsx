import React from 'react';
import { Card, Badge, Button, cn } from '../ui';
import { useSocket } from '../../context/SocketContext';
import { Radio, Pause, Play, ExternalLink, Flame } from 'lucide-react';
import { formatKyivTime } from '../../utils/formatters';
import { getScoreBadgeClass, getCategoryBadgeClass } from '../../utils/colors';

export const LiveFeed: React.FC = () => {
  const { feedItems, isFeedPaused, unreadFeedCount, pauseFeed, resumeFeed } = useSocket();

  return (
    <Card className="p-5 flex flex-col h-[480px]">
      {/* Feed Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-surface-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <span>Живая лента находок</span>
              <span className="text-[11px] font-normal text-slate-400 font-mono">
                (последние {feedItems.length} записей)
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">Поток подходящих ссылок в реальном времени через WebSocket</p>
          </div>
        </div>

        {/* Pause / Resume Controls */}
        <div className="flex items-center gap-2">
          {isFeedPaused ? (
            <Button
              variant="primary"
              size="sm"
              onClick={resumeFeed}
              className="bg-emerald-600 hover:bg-emerald-500 text-xs gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Возобновить</span>
              {unreadFeedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-900 text-emerald-200 text-[10px] font-mono font-bold">
                  +{unreadFeedCount} новых
                </span>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={pauseFeed}
              className="text-xs gap-1.5 hover:border-amber-500/50 hover:text-amber-300"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Пауза</span>
            </Button>
          )}
        </div>
      </div>

      {/* Paused Banner with Unread Count */}
      {isFeedPaused && unreadFeedCount > 0 && (
        <button
          onClick={resumeFeed}
          className="w-full mb-3 p-2 bg-brand-500/20 border border-brand-500/40 rounded-xl text-xs font-semibold text-brand-300 flex items-center justify-center gap-2 hover:bg-brand-500/30 transition-colors shadow-sm animate-pulse"
        >
          <Flame className="w-4 h-4 text-amber-400" />
          <span>Накоплено {unreadFeedCount} новых подходящих ссылок. Нажмите, чтобы показать!</span>
        </button>
      )}

      {/* Feed Rows Container */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-surface-border/30">
        {feedItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
            <Radio className="w-8 h-8 mb-2 animate-pulse text-slate-600" />
            <p className="text-sm font-medium text-slate-400">Ожидание новых находок...</p>
            <p className="text-xs text-slate-500 mt-1">
              Ссылки, проходящие ваш порог оценки, появятся здесь автоматически
            </p>
          </div>
        ) : (
          feedItems.map((item, idx) => (
            <div
              key={`${item.id}_${item.classified_at}`}
              className={cn(
                'pt-2.5 first:pt-0 flex items-center justify-between gap-3 text-xs transition-all hover:bg-surface-light/40 p-1.5 rounded-lg group',
                idx === 0 && 'animate-glow-row'
              )}
            >
              {/* Left: Time & Score Badge */}
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <span className="font-mono text-[11px] text-slate-400">
                  {formatKyivTime(item.classified_at)}
                </span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-md border text-[11px] font-mono',
                    getScoreBadgeClass(item.score)
                  )}
                >
                  {item.score} / 10
                </span>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium border hidden sm:inline-block',
                    getCategoryBadgeClass(item.category)
                  )}
                >
                  {item.category}
                </span>
              </div>

              {/* Middle: Domain & Title */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-100">{item.domain}</span>
                  <span className="text-[10px] text-slate-400 font-mono uppercase bg-surface-lighter px-1.5 rounded">
                    {item.region}
                  </span>
                </div>
                <p className="text-slate-300 text-[11px] truncate mt-0.5" title={item.title}>
                  {item.title}
                </p>
              </div>

              {/* Right: Source Query & Link */}
              <div className="flex items-center gap-3 flex-shrink-0 text-right">
                <div className="hidden lg:block max-w-[200px] truncate text-[11px] text-slate-400 font-sans" title={item.query_orig}>
                  {item.query_orig}
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-brand-300 hover:bg-surface-lighter transition-colors"
                  title="Открыть ссылку в новой вкладке"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};
