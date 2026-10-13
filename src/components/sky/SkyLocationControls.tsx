'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ChevronDown, Shuffle } from 'lucide-react';
import UseMySkyButton from '@/components/ui/UseMySkyButton';
import { useSkyStore } from '@/lib/stores/skyStore';

function coordinate(value: number, positive: string, negative: string): string {
  const degrees = Math.abs(value).toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
  return `${degrees}° ${value < 0 ? negative : positive}`;
}

const actionClass = 'sky-footer-action inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded text-xs text-neutral-500 hover:text-accent transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60';

export default function SkyLocationControls({ observation }: { observation?: ReactNode }) {
  const detailsId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const observer = useSkyStore(state => state.observer);
  const destination = useSkyStore(state => state.destination);
  const detailsOpen = useSkyStore(state => state.detailsOpen);
  const toggleDetails = useSkyStore(state => state.toggleDetails);
  const randomSky = useSkyStore(state => state.randomSky);
  const resetSky = useSkyStore(state => state.resetSky);
  const status = useSkyStore(state => state.status);
  const notice = useSkyStore(state => state.notice);
  const busy = status === 'locating' || status === 'resetting';
  const label = destination?.englishName ?? (observer.source === 'geolocation' ? 'Your sky' :
    observer.source === 'override' ? 'Custom sky' : 'Fudan sky');
  const chineseName = destination?.chineseName ?? (observer.source === 'default' ? '复旦大学 · 上海' :
    observer.source === 'geolocation' ? '您的位置' : '自定义观测位置');
  const description = destination?.chineseDescription ?? (observer.source === 'default' ? '' :
    observer.source === 'geolocation' ? '按浏览器定位计算的星空。' : '按链接中的经纬度计算的星空。');
  const coordinates = `${coordinate(observer.latitude, 'N', 'S')}, ${coordinate(observer.longitude, 'E', 'W')}`;

  useEffect(() => {
    if (!detailsOpen) return;
    const frame = requestAnimationFrame(() => {
      const scroll = scrollRef.current;
      const details = detailsRef.current;
      if (!scroll || !details) return;
      const reveal = Math.min(details.firstElementChild?.scrollWidth ?? 0, scroll.clientWidth * 0.45);
      scroll.scrollTo({
        left: Math.max(scroll.scrollLeft, details.offsetLeft - scroll.offsetLeft + reveal - scroll.clientWidth),
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [detailsOpen]);

  const isFudan = observer.source === 'default';
  const nameButton = (
    <button type="button" className={`${actionClass} sky-location-trigger`}
      aria-expanded={detailsOpen} aria-controls={detailsId}
      aria-label={`${label}, ${detailsOpen ? 'hide' : 'show'} Chinese details`}
      onClick={toggleDetails} onKeyDown={event => { if (event.key === 'Escape' && detailsOpen) toggleDetails(); }}>
      <span>{label}</span>
      <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true"
        className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${detailsOpen ? 'rotate-180' : ''}`} />
    </button>
  );

  return (
    <div className="sky-location relative w-full min-w-0 max-w-full"
      data-destination-id={destination?.id ?? observer.source}>
      <div className={observation ? 'sky-controls-layout' : 'sky-controls-inline'}>
        {observation}
        <div className="sky-controls-primary">
          {isFudan ? nameButton : observer.source !== 'geolocation' && (
            <button type="button" disabled={busy} onClick={() => void resetSky()} className={actionClass}>
              Fudan sky
            </button>
          )}
          <UseMySkyButton />
        </div>
        <div ref={scrollRef} className="sky-location-scroll">
          <div className="flex h-full w-max min-w-full items-center gap-4 xl:justify-end">
            <button type="button" disabled={busy} onClick={randomSky} className={actionClass}>
              <Shuffle size={12} strokeWidth={1.5} aria-hidden="true" />
              {destination ? 'Another sky' : 'Random sky'}
            </button>
            {!isFudan && nameButton}
            <div ref={detailsRef} id={detailsId} className={`sky-location-details ${detailsOpen ? 'is-open' : ''}`}
              aria-hidden={!detailsOpen}>
              <div className="min-w-0 overflow-hidden">
                <span className="text-xs text-neutral-600" lang="zh-CN">
                  {chineseName}{description && ` · ${description}`}
                </span>
              </div>
            </div>
            {destination && <span className="text-xs text-neutral-500">{destination.country}</span>}
            {!isFudan && <span className="text-xs tabular-nums text-neutral-500">{coordinates}</span>}
          </div>
        </div>
      </div>
      {notice && <p role="status" className="absolute bottom-full right-0 max-w-sm rounded bg-neutral-50 px-3 py-2 text-xs text-neutral-600">{notice}</p>}
    </div>
  );
}
