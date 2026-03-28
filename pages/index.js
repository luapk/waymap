"use client";

import React, { useState, useEffect, useMemo } from "react";
import * as d3 from "d3";

// Back to the original data source that successfully bypassed your network blocks
const GEO_URL = "https://raw.githubusercontent.com/radoi90/housequest-data/master/london_boroughs.geojson";

const COHORTS = {
  "The Frictionless Native": { color: "#0066FF", stroke: "#4D94FF", boroughs: ["Camden","Islington","Southwark"], need: "Seamless digital integration", level: 2 },
  "The Privacy Premium": { color: "#0D1B2A", stroke: "#2A4F6F", boroughs: ["Westminster","City of London","Kensington and Chelsea", "Kensington"], need: "Silence, privacy, consistency", level: 1 },
  "The 3AM Londoner": { color: "#00E5A0", stroke: "#33EFA8", boroughs: ["Hackney","Tower Hamlets","Lambeth"], need: "Safety when options vanish", level: 3 },
  "The Last Mile Londoner": { color: "#B8D940", stroke: "#C7E360", boroughs: ["Barking","Dagenham","Newham","Lewisham","Croydon"], need: "First/last mile to rail", level: 4 },
};

const BG = "#060B14";
const UNMAPPED_FILL = "#0A1018";
const UNMAPPED_STROKE = "#121E2E";

function getCohort(boroughName) {
  if (!boroughName) return null;
  const n = boroughName.toLowerCase();
  for (const [k, v] of Object.entries(COHORTS)) {
    if (v.boroughs.some(b => n.toLowerCase().includes(b.toLowerCase()))) {
      return { cohortName: k, ...v };
    }
  }
  return null;
}

export default function WaymoMap() {
  const [geoData, setGeoData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, name: "", cohort: "", color: "" });
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // 1. Safe Window Sizing
  useEffect(() => {
    const handleResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    handleResize(); 
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 2. Fetch the Working Data
  useEffect(() => {
    fetch(GEO_URL)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data && data.features) {
          setGeoData(data);
          setStatus("ready");
        } else {
          throw new Error("Invalid GeoJSON structure");
        }
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus("error");
      });
  }, []);

  // 3. One-Time Projection (No lag)
  const { pathGenerator, mapW, mapH, ox, oy } = useMemo(() => {
    if (!geoData || dims.w === 0) return { pathGenerator: null };

    const mapWidth = dims.w * 0.70;
    const mapHeight = dims.h * 0.85;
    const offsetX = dims.w * 0.02;
    const offsetY = dims.h * 0.08;

    let projection;
    try {
      // Force all coordinates into the visible box
      projection = d3.geoMercator().fitExtent([[20, 20], [mapWidth - 20, mapHeight - 20]], geoData);
    } catch (e) {
      // Ultimate safety fallback if data is weird
      projection = d3.geoMercator().center([-0.1278, 51.5074]).scale(dims.w * 40).translate([mapWidth / 2, mapHeight / 2]);
    }

    return {
      pathGenerator: d3.geoPath().projection(projection),
      mapW: mapWidth,
      mapH: mapHeight,
      ox: offsetX,
      oy: offsetY
    };
  }, [geoData, dims]);

  // Loading & Error States
  if (status === "loading" || dims.w === 0) {
    return <div style={{ background: BG, color: "#00E5A0", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>LOADING WAYMO PILOT DATA...</div>;
  }
  if (status === "error") {
    return <div style={{ background: BG, color: "#EF4444", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
      <div>DATA CONNECTION FAILED</div>
      <div style={{ fontSize: 12, marginTop: 10, color: "#6A8AAB" }}>{errorMessage}</div>
    </div>;
  }

  // Fast CSS Hover (Bypasses React State Lag)
  const handleMouseMove = (e) => {
    const target = e.target;
    if (target.tagName === 'path' && target.classList.contains('london-borough')) {
      setTooltip({
        show: true,
        x: e.clientX,
        y: e.clientY,
        name: target.getAttribute('data-name'),
        cohort: target.getAttribute('data-cohort'),
        color: target.getAttribute('data-color')
      });
    } else {
      setTooltip(prev => prev.show ? { ...prev, show: false } : prev);
    }
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: BG, overflow: "hidden", position: "relative", fontFamily: "monospace" }}>
      
      {/* ZERO-LAG HOVER STYLES */}
      <style>{`
        .london-borough {
          transition: opacity 0.2s ease, stroke-width 0.2s ease;
          cursor: crosshair;
        }
        .london-borough:hover {
          stroke: #ffffff;
          stroke-width: 2.5px;
          opacity: 1 !important;
          z-index: 10;
        }
      `}</style>

      {/* MAP SVG */}
      <svg 
        width={dims.w} 
        height={dims.h} 
        style={{ position: "absolute", top: 0, left: 0 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(prev => ({ ...prev, show: false }))}
      >
        <g transform={`translate(${ox}, ${oy})`}>
          
          {/* Grid Background */}
          <g opacity="0.05">
            {Array.from({ length: Math.floor(mapW / 50) }).map((_, i) => (
              <line key={`v-${i}`} x1={i * 50} y1={0} x2={i * 50} y2={mapH} stroke="#00E5A0" strokeWidth="1" />
            ))}
            {Array.from({ length: Math.floor(mapH / 50) }).map((_, j) => (
              <line key={`h-${j}`} x1={0} y1={j * 50} x2={mapW} y2={j * 50} stroke="#00E5A0" strokeWidth="1" />
            ))}
          </g>

          {/* Render Boroughs */}
          <g>
            {geoData.features.map((feature, i) => {
              const name = feature.properties.name || feature.properties.NAME || `Borough-${i}`;
              const cohort = getCohort(name);
              const pathString = pathGenerator(feature);
              
              if (!pathString) return null;

              return (
                <path
                  key={name}
                  d={pathString}
                  fill={cohort ? cohort.color : UNMAPPED_FILL}
                  stroke={cohort ? cohort.stroke : UNMAPPED_STROKE}
                  strokeWidth={cohort ? 1 : 0.5}
                  opacity={cohort ? 0.85 : 0.25}
                  className="london-borough"
                  data-name={name}
                  data-cohort={cohort ? cohort.cohortName : "Out of bounds"}
                  data-color={cohort ? cohort.color : "#4A6A8A"}
                />
              );
            })}
          </g>

          {/* Frame Corners */}
          <g stroke="#00E5A0" strokeWidth="2" fill="none" opacity="0.5">
            <polyline points={`0,20 0,0 20,0`} />
            <polyline points={`${mapW-20},0 ${mapW},0 ${mapW},20`} />
            <polyline points={`0,${mapH-20} 0,${mapH} 20,${mapH}`} />
            <polyline points={`${mapW-20},${mapH} ${mapW},${mapH} ${mapW},${mapH-20}`} />
          </g>
        </g>
      </svg>
      
      {/* UI HEADER */}
      <div style={{position:"absolute", top:40, left:40, pointerEvents:"none"}}>
        <div style={{color:"#00E5A0", fontSize:11, letterSpacing:5, fontWeight:800, display: "flex", alignItems: "center", gap: 8}}>
          <div style={{width: 6, height: 6, background: "#00E5A0", borderRadius: "50%"}} />
          WAYMO // LONDON
        </div>
        <div style={{color:"#fff", fontSize:32, fontWeight:900, marginTop: 4, letterSpacing: "-0.5px"}}>Cohort Deployment Map</div>
      </div>

      {/* RIGHT SIDE PANEL */}
      <div style={{position:"absolute", right:0, top:0, width:"25%", height:"100%", background:"rgba(6, 11, 20, 0.9)", borderLeft:"1px solid #1A3050", padding: "50px 40px", minWidth: 320, zIndex: 10, backdropFilter:"blur(10px)"}}>
        <div style={{color:"#3A5A7A", fontSize:10, letterSpacing:4, fontWeight:700, marginBottom:40, borderBottom: "1px solid #1A3050", paddingBottom: 10}}>COHORT CLASSIFICATION</div>
        
        {Object.entries(COHORTS).map(([name, data]) => (
          <div key={name} style={{marginBottom:30, display:"flex", gap:16, alignItems: "flex-start"}}>
            <div style={{
              width:44, height:44, background:data.color, borderRadius:6, flexShrink: 0,
              display:"flex", alignItems:"center", justifyContent:"center", 
              color: data.color === "#B8D940" ? "#000" : "#fff", fontWeight:900, fontSize: 14,
              border: data.color === "#0D1B2A" ? `1px solid ${data.stroke}` : "none",
              boxShadow: data.color !== "#0D1B2A" ? `0 0 15px ${data.color}40` : "none"
            }}>
              L{data.level}
            </div>
            <div>
              <div style={{color:"#fff", fontSize:14, fontWeight:700, marginBottom: 4}}>{name}</div>
              <div style={{color:"#6A8AAB", fontSize:11, lineHeight: 1.4}}>{data.need}</div>
              <div style={{color:"#3A5A7A", fontSize:9, marginTop: 6, textTransform: "uppercase", letterSpacing: 1}}>{data.boroughs.join(", ")}</div>
            </div>
          </div>
        ))}
      </div>

      {/* FLOATING TOOLTIP */}
      <div style={{
        position:"fixed", 
        left: tooltip.x + 20, 
        top: tooltip.y - 20, 
        background:"#0B1222", 
        border:`1px solid ${tooltip.color === "#4A6A8A" ? "#1A3050" : tooltip.color}`, 
        padding:"12px 16px", 
        color:"#fff", 
        pointerEvents:"none", 
        zIndex:100,
        opacity: tooltip.show ? 1 : 0,
        transform: tooltip.show ? "scale(1)" : "scale(0.95)",
        transition: "opacity 0.1s ease, transform 0.1s ease",
        boxShadow: `0 8px 32px rgba(0,0,0,0.5)`,
        minWidth: 180
      }}>
        <div style={{fontSize:15, fontWeight:900, marginBottom:4, letterSpacing: "-0.5px"}}>{tooltip.name.toUpperCase()}</div>
        <div style={{fontSize:11, color: tooltip.color, fontWeight: 700}}>{tooltip.cohort}</div>
      </div>
      
    </div>
  );
}