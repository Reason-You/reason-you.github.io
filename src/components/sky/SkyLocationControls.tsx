'use client';

import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react';
import { Check, ChevronDown, MapPin, School, Shuffle, X } from 'lucide-react';
import UseMySkyButton from '@/components/ui/UseMySkyButton';
import { isShanghaiDaylight, useSkyStore } from '@/lib/stores/skyStore';
import { formatObservationTime, SHANGHAI_TIME_ZONE } from '@/lib/sky/time';
import './stars-above-location.css';

function coordinate(value: number, positive: string, negative: string): string {
  const degrees = Math.abs(value).toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
  return `${degrees}° ${value < 0 ? negative : positive}`;
}

const actionClass = 'sky-footer-action inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded text-xs text-neutral-500 hover:text-accent transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60';

export function StarsAboveLocationControls() {
  const detailsId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const observer = useSkyStore(state => state.observer);
  const destination = useSkyStore(state => state.destination);
  const detailsOpen = useSkyStore(state => state.detailsOpen);
  const toggleDetails = useSkyStore(state => state.toggleDetails);
  const randomSky = useSkyStore(state => state.randomSky);
  const resetSky = useSkyStore(state => state.resetSky);
  const requestMySky = useSkyStore(state => state.requestMySky);
  const status = useSkyStore(state => state.status);
  const notice = useSkyStore(state => state.notice);
  const minute = useSkyStore(state => state.snapshotDate === null ? null : Math.floor(state.snapshotDate / 60_000));
  const skyLookMode = useSkyStore(state => state.skyLookMode);
  const setSkyLookMode = useSkyStore(state => state.setSkyLookMode);
  const previewShanghaiTonight = useSkyStore(state => state.previewShanghaiTonight);
  const busy = status === 'locating' || status === 'resetting';
  const isFudan = observer.source === 'default';
  const isLocal = observer.source === 'geolocation';
  const label = destination?.englishName ?? (isFudan ? 'Fudan University' : isLocal ? 'Your sky' : 'Custom sky');
  const country = destination?.country ?? (isFudan ? 'China' : null);
  const coordinates = `${coordinate(observer.latitude, 'N', 'S')}, ${coordinate(observer.longitude, 'E', 'W')}`;
  const chineseName = destination?.chineseName ?? (isFudan ? '复旦大学，上海' : isLocal ? '您的位置' : '自定义观测位置');
  const description = destination?.chineseDescription ?? (isFudan ? '复旦的百年星空' :
    isLocal ? '按浏览器定位计算的星空。' : '按链接中的经纬度计算的星空。');
  const timeZone = destination?.timeZone ?? (isFudan ? SHANGHAI_TIME_ZONE : undefined);
  const timeLabel = isFudan ? 'Shanghai' : timeZone ? 'Local time' : 'Device time';
  const time = useMemo(() => minute === null ? null : {
    text: formatObservationTime(minute * 60_000, timeZone),
    dateTime: new Date(minute * 60_000).toISOString(),
  }, [minute, timeZone]);
  const daylight = useMemo(() => detailsOpen && isFudan && isShanghaiDaylight(minute === null ? Date.now() : minute * 60_000),
    [detailsOpen, isFudan, minute]);
  const closeDetails = () => {
    toggleDetails();
    trigger.current?.focus();
  };

  return (
    <div className="stars-above-location" data-destination-id={destination?.id ?? observer.source}
      onKeyDown={event => { if (event.key === 'Escape' && detailsOpen) closeDetails(); }}>
      <div className="stars-above-clock">
        {time && <time dateTime={time.dateTime} title={timeZone}>{timeLabel}, {time.text}</time>}
      </div>
      <div className="stars-above-source-actions">
        <button type="button" className="stars-above-action" disabled={busy}
          aria-label={isLocal ? 'Back to Fudan sky' : undefined}
          onClick={() => { if (isLocal) void resetSky(); else void requestMySky(); }}>
          {isLocal ? <School size={14} aria-hidden="true" /> : <MapPin size={14} aria-hidden="true" />}
          {status === 'locating' ? 'Locating…' : isLocal ? 'Back to Fudan sky' : 'Use my sky'}
        </button>
        <button type="button" className="stars-above-action" disabled={busy} onClick={randomSky}>
          <Shuffle size={14} aria-hidden="true" />{destination ? 'Another sky' : 'Random sky'}
        </button>
        {!isFudan && !isLocal && <button type="button" className="stars-above-action stars-above-desktop-reset"
          disabled={busy} onClick={() => void resetSky()}><School size={14} aria-hidden="true" />Back to Fudan sky</button>}
      </div>
      <div className="stars-above-observation">
        <div className="stars-above-place-country">
          <button ref={trigger} type="button" className="stars-above-action stars-above-place"
            aria-controls={detailsId} aria-expanded={detailsOpen} aria-label={`${label}, location details`}
            title={label} onClick={toggleDetails}>
            <span>{label}</span><ChevronDown size={14} aria-hidden="true" />
          </button>
          {country && <span className="stars-above-country">{country}</span>}
        </div>
        <span className="stars-above-coordinates">{coordinates}</span>
      </div>
      <section id={detailsId} className="stars-above-location-sheet" aria-label="Location details" hidden={!detailsOpen}>
        <div className="stars-above-sheet-head">
          <h2 lang={isFudan ? 'zh-CN' : undefined}>{isFudan ? chineseName : label}</h2>
          <button type="button" className="stars-above-action stars-above-close" onClick={closeDetails} aria-label="Close location details">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {!isFudan && <p lang="zh-CN">{chineseName}</p>}
        <p lang="zh-CN">{description}</p>
        {isFudan && <div className="stars-above-comparison">
          <h3>What if Shanghai turned off its lights?</h3>
          <div className="stars-above-segments" role="group" aria-label="Shanghai sky comparison">
            <button type="button" className="stars-above-action" aria-pressed={skyLookMode === 'city'}
              onClick={() => setSkyLookMode('city')}>
              <Check size={14} aria-hidden="true" />City sky
            </button>
            <button type="button" className="stars-above-action" aria-pressed={skyLookMode === 'ideal'}
              disabled={daylight && skyLookMode !== 'ideal'} onClick={() => setSkyLookMode('ideal')}>
              <Check size={14} aria-hidden="true" />Ideal dark sky
            </button>
          </div>
          {daylight && <button type="button" className="stars-above-action" onClick={previewShanghaiTonight}>
            Preview tonight at 22:00
          </button>}
        </div>}
        {!isFudan && !isLocal && <button type="button" className="stars-above-action stars-above-mobile-reset"
          disabled={busy} onClick={() => void resetSky()}><School size={14} aria-hidden="true" />Back to Fudan sky</button>}
      </section>
      {notice && <p role="status" className="stars-above-notice">{notice}</p>}
    </div>
  );
}

export default function SkyLocationControls({ observation, attribution }: {
  observation: ReactNode;
  attribution?: ReactNode;
}) {
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
  const isFudan = observer.source === 'default';
  const label = destination?.englishName ?? (observer.source === 'geolocation' ? 'Your sky' :
    observer.source === 'override' ? 'Custom sky' : 'Fudan University');
  const country = destination?.country ?? (isFudan ? 'China' : null);
  const chineseName = destination?.chineseName ?? (observer.source === 'default' ? '复旦大学 · 上海' :
    observer.source === 'geolocation' ? '您的位置' : '自定义观测位置');
  const description = destination?.chineseDescription ?? (observer.source === 'default' ? '复旦的百年星空' :
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
      <div className="sky-controls-layout">
        {observation}
        <div className="sky-controls-primary">
          {observer.source !== 'geolocation' && (
            <button type="button" disabled={busy} className={actionClass}
              aria-expanded={isFudan ? detailsOpen : undefined}
              aria-controls={isFudan ? detailsId : undefined}
              onClick={() => { if (isFudan) toggleDetails(); else void resetSky(); }}>
              <School size={12} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
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
            {nameButton}
            <div ref={detailsRef} id={detailsId} className={`sky-location-details ${detailsOpen ? 'is-open' : ''}`}
              aria-hidden={!detailsOpen}>
              <div className="min-w-0 overflow-hidden text-xs">
                <span className="text-neutral-600" lang="zh-CN">
                  {chineseName}{description && ` · ${description}`}
                </span>
              </div>
            </div>
            {country && <span className="text-xs text-neutral-500">{country}</span>}
            <span className="text-xs tabular-nums text-neutral-500">{coordinates}</span>
            {attribution}
          </div>
        </div>
      </div>
      {notice && <p role="status" className="absolute bottom-full right-0 max-w-sm rounded bg-neutral-50 px-3 py-2 text-xs text-neutral-600">{notice}</p>}
    </div>
  );
}
