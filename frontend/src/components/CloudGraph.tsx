import { useState, useEffect, useRef } from 'react';
import { Activity, X, RefreshCw, BarChart2 } from 'lucide-react';
import { api } from '../api';

interface CloudGraphProps {
  identifier: string;
  profile: string;
  region: string;
  metricType: 'bw' | 'pps';
  onClose: () => void;
  name?: string;
}

export default function CloudGraph({ identifier, profile, region, metricType, onClose, name }: CloudGraphProps) {
  const [data, setData] = useState<{ timestamps: string[], in: number[], out: number[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(1);
  const [unit, setUnit] = useState('mbps'); // Only used for 'bw'

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  const fetchData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const result = await api.awsMetrics(profile, region, identifier, metricType, hours, unit);
      if (result.error) throw new Error(result.error);
      setData(result);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message || "Failed to fetch metrics");
    } finally {
      if (!silent) setIsLoading(false);
      else setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(false);
    const interval = setInterval(() => fetchData(true), 60000);
    return () => clearInterval(interval);
  }, [identifier, profile, region, metricType, hours, unit]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // SVG dimensions
  const width = Math.max(dimensions.width, 400);
  // Maintain a target ratio of 800x350 (2.28:1), but cap height to a reasonable maximum (e.g. 500)
  // so ultra-wide monitors don't produce massive graphs that require scrolling.
  let height = Math.max(width * (350 / 800), 200);
  if (height > 500) height = 500;
  
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const renderGraph = () => {
    if (!data || !data.timestamps || data.timestamps.length === 0) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center opacity-40">
          <Activity size={48} className="text-[#81a1c1] mb-4" />
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#eceff4]">No Data Available</p>
        </div>
      );
    }

    const { timestamps, in: inData, out: outData } = data;
    
    const maxIn = Math.max(...(inData || [0]));
    const maxOut = Math.max(...(outData || [0]));
    let maxY = Math.max(maxIn, maxOut);
    maxY = Math.max(maxY * 1.1, 1);

    const getX = (index: number) => padding.left + (index / Math.max(1, timestamps.length - 1)) * innerWidth;
    const getY = (value: number) => padding.top + innerHeight - (value / maxY) * innerHeight;

    const createPath = (dataSet: number[]) => {
      if (!dataSet || dataSet.length === 0) return '';
      return dataSet.map((val, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(val)}`).join(' ');
    };

    const pathIn = createPath(inData);
    const pathOut = createPath(outData);

    const yTicks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY];
    const xStep = Math.max(1, Math.floor(timestamps.length / 8));
    
    const formatValue = (v: number) => {
        if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
        if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
        return v.toFixed(1);
    };

    return (
      <div className="relative w-full h-full">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible bg-[#2e3440] rounded-xl border border-[#3b4252] shadow-inner block">
          {yTicks.map((val, i) => (
            <g key={`y-${i}`}>
              <line 
                x1={padding.left} 
                y1={getY(val)} 
                x2={width - padding.right} 
                y2={getY(val)} 
                stroke="#3b4252" 
                strokeWidth="1" 
                strokeDasharray="4 4"
              />
              <text 
                x={padding.left - 10} 
                y={getY(val) + 4} 
                fill="#d8dee9" 
                fontSize="10" 
                fontFamily="monospace"
                textAnchor="end"
                opacity={0.6}
              >
                {formatValue(val)}
              </text>
            </g>
          ))}

          {timestamps.map((ts, i) => {
            // Render labels purely on the calculated step to avoid text overlap at the end of the X axis.
            if (i % xStep !== 0) return null;
            return (
              <text 
                key={`x-${i}`}
                x={getX(i)} 
                y={height - padding.bottom + 20} 
                fill="#d8dee9" 
                fontSize="10" 
                fontFamily="monospace"
                textAnchor="middle"
                opacity={0.6}
              >
                {ts}
              </text>
            );
          })}

          {pathIn && (
            <path 
              d={pathIn} 
              fill="none" 
              stroke="#81a1c1" 
              strokeWidth="2" 
              strokeLinejoin="round" 
              strokeLinecap="round" 
              style={{ filter: 'drop-shadow(0px 2px 4px rgba(129, 161, 193, 0.3))' }}
            />
          )}
          {pathOut && (
            <path 
              d={pathOut} 
              fill="none" 
              stroke="#ebcb8b" 
              strokeWidth="2" 
              strokeLinejoin="round" 
              strokeLinecap="round" 
              style={{ filter: 'drop-shadow(0px 2px 4px rgba(235, 203, 139, 0.3))' }}
            />
          )}

          <g className="data-points">
            {timestamps.map((ts, i) => {
              const inVal = inData?.[i] ?? 0;
              const outVal = outData?.[i] ?? 0;
              const tooltipText = `Time: ${ts}\nIn: ${formatValue(inVal)}\nOut: ${formatValue(outVal)}`;
              
              return (
                <g key={`pt-${i}`}>
                  {inData && (
                    <circle 
                      cx={getX(i)} cy={getY(inVal)} r="8" fill="#81a1c1" 
                      className="opacity-0 hover:opacity-100 transition-opacity cursor-crosshair"
                    >
                       <title>{tooltipText}</title>
                    </circle>
                  )}
                  {outData && (
                    <circle 
                      cx={getX(i)} cy={getY(outVal)} r="8" fill="#ebcb8b" 
                      className="opacity-0 hover:opacity-100 transition-opacity cursor-crosshair"
                    >
                       <title>{tooltipText}</title>
                    </circle>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    );
  };

  return (
    <div className="w-full h-full bg-[#2e3440] flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#3b4252] bg-[#3b4252]/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#88c0d0]/20 text-[#88c0d0] rounded-xl flex items-center justify-center shadow-inner shrink-0">
            <BarChart2 size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[#eceff4] tracking-wider uppercase italic truncate">
              {metricType === 'bw' ? 'Bandwidth Utilization' : 'Packets Per Second'}
            </h2>
            <p className="text-[10px] text-[#d8dee9]/60 font-bold tracking-widest uppercase truncate">
              {name ? `${name} (${identifier})` : identifier} | {profile} | {region}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center bg-[#2e3440] border border-[#434c5e] rounded-lg overflow-hidden h-9 shadow-inner">
            <select 
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="bg-transparent border-none text-[10px] font-black text-[#eceff4] uppercase tracking-widest px-3 focus:outline-none appearance-none cursor-pointer border-r border-[#434c5e]"
            >
                <option className="bg-[#2e3440] text-[#d8dee9]" value={1}>Last 1 Hour</option>
                <option className="bg-[#2e3440] text-[#d8dee9]" value={3}>Last 3 Hours</option>
                <option className="bg-[#2e3440] text-[#d8dee9]" value={6}>Last 6 Hours</option>
                <option className="bg-[#2e3440] text-[#d8dee9]" value={12}>Last 12 Hours</option>
                <option className="bg-[#2e3440] text-[#d8dee9]" value={24}>Last 24 Hours</option>
            </select>
            
            {metricType === 'bw' && (
              <select 
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="bg-transparent border-none text-[10px] font-black text-[#ebcb8b] uppercase tracking-widest px-3 focus:outline-none appearance-none cursor-pointer"
              >
                  <option className="bg-[#2e3440] text-[#ebcb8b]" value="kbps">KBPS</option>
                  <option className="bg-[#2e3440] text-[#ebcb8b]" value="mbps">MBPS</option>
                  <option className="bg-[#2e3440] text-[#ebcb8b]" value="gbps">GBPS</option>
              </select>
            )}
          </div>

          <button 
            onClick={() => fetchData()}
            disabled={isLoading}
            className="p-2 text-[#d8dee9]/40 hover:text-[#88c0d0] hover:bg-[#88c0d0]/10 rounded-lg transition-all bg-transparent border-none outline-none cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <div className="w-px h-5 bg-[#434c5e]" />
          <button 
            onClick={onClose} 
            className="p-2 text-[#81a1c1] hover:text-[#eceff4] hover:bg-[#bf616a]/20 rounded-lg transition-all bg-transparent border-none outline-none cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden p-8 flex flex-col">
          {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                  <Activity size={48} className="animate-pulse text-[#88c0d0] mb-4" />
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-[#eceff4]">Fetching CloudWatch Metrics...</p>
              </div>
          ) : error ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center max-w-lg mx-auto">
                  <div className="w-16 h-16 bg-[#bf616a]/20 text-[#bf616a] rounded-2xl flex items-center justify-center mb-6">
                      <X size={32} />
                  </div>
                  <h3 className="text-[#eceff4] text-xl font-black uppercase tracking-widest mb-2">Metrics Fetch Failed</h3>
                  <p className="text-[#d8dee9]/70 font-mono text-xs bg-[#3b4252]/50 p-4 rounded-lg border border-[#bf616a]/30">{error}</p>
              </div>
          ) : (
              <div className="w-full flex-1 relative flex flex-col items-center">
                  <div ref={containerRef} className="w-full relative h-auto">
                      {renderGraph()}
                  </div>
                  
                  {/* Legend + last updated */}
                  <div className="flex items-center justify-between pt-6 w-full max-w-4xl mx-auto shrink-0 pl-14 pr-2">
                     <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                           <div className="w-3 h-3 rounded-full bg-[#81a1c1] shadow-[0_0_8px_rgba(129,161,193,0.6)]"></div>
                           <span className="text-[11px] font-black uppercase text-[#81a1c1] tracking-widest">Inbound</span>
                        </div>
                        <div className="flex items-center gap-3">
                           <div className="w-3 h-3 rounded-full bg-[#ebcb8b] shadow-[0_0_8px_rgba(235,203,139,0.6)]"></div>
                           <span className="text-[11px] font-black uppercase text-[#ebcb8b] tracking-widest">Outbound</span>
                        </div>
                     </div>
                     {lastUpdated && (
                       <div className="flex items-center gap-2 text-[10px] font-mono text-[#d8dee9]/40">
                         {isRefreshing && <Activity size={10} className="animate-pulse text-[#88c0d0]" />}
                         Updated {lastUpdated.toLocaleTimeString()} · auto 60s
                       </div>
                     )}
                  </div>
              </div>
          )}
      </div>
    </div>
  );
}
