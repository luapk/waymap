"use client";

import React, { useState, useEffect, useMemo } from "react";
import * as d3 from "d3";

// Reliable WGS84 (Lat/Lng) London Borough boundaries
const GEO_URL = "https://raw.githubusercontent.com/radoi90/housequest-data/master/london_boroughs.geojson";

const COHORTS = {
  "The Frictionless Native": { color: "#0066FF", boroughs: ["Camden","Islington","Southwark"], need: "Seamless digital integration", level: 2 },
  "The Privacy Premium": { color: "#0D1B2A", stroke: "#2A4F6F", boroughs: ["Westminster","City of London","Kensington and Chelsea", "Kensington"], need: "Silence, privacy, consistency", level: 1 },
  "The 3AM Londoner": { color: "#00E5A0", boroughs: ["Hackney","Tower Hamlets","Lambeth"], need: "Safety when options vanish", level: 3 },
  "The Last Mile Londoner": { color: "#B8D940", boroughs: ["Barking","Dagenham","Newham","Lewisham","Croydon"], need: "First/last mile to rail", level: 4 },
};

const BG = "#060B14";
const UNMAPPED = "#0A1018";
const UNMAPPED_STROKE = "#121E2E";

function getCohort(boroughName) {
  if (!boroughName) return null;
  const n = boroughName.toLowerCase();
  for (const [k, v] of Object.entries(COHORTS)) {
    if (v.boroughs.some(b => n.includes(b.toLowerCase()) || b.toLowerCase().includes(n))) {
      return { cohortName: k, ...v };
    }
  }
  return null;
}

export default function WaymoMap() {
  const [geoData, setGeoData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [hovered, setHovered] = useState(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // 1. Handle Window Sizing safely for Next.js SSR
  useEffect(() => {
    const handleResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    handleResize(); // Set immediately on mount
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 2. Fetch Data
  useEffect(() => {
    fetch(GEO_URL)
      .then(res => res.json())
      .then(data => {
        if (data && data.features) {
          setGeoData(data);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      })
      .catch(err => {
        console.error("Failed to load map data", err);
        setStatus("error");
      });
  }, []);

  // 3. Let D3 do the math, but let React render the paths (This fixes the blank screen!)
  const { pathGenerator, mapW, mapH, ox, oy } = useMemo(() => {
    if (!geoData || dims.w === 0) return { pathGenerator: null };

    const mapWidth = dims.w * 0.65;
    const mapHeight = dims.h * 0.85;
    const offsetX = dims.w * 0.02;
    const offsetY = dims.h * 0.08;

    // Standard Mercator Projection fitted perfectly to our bounding box
    const projection = d3.geoMercator().fitExtent(
      [[40, 40], [mapWidth - 40, mapHeight - 40]], 
      geoData
    );

    return {
      pathGenerator: d3.geoPath().projection(projection),
      mapW: mapWidth,
      mapH: mapHeight,
      ox: offsetX,
      oy: offsetY
    };
  }, [geoData, dims]);

  // Handle Initial Loading States
  if (status === "loading" || dims.w === 0) {
    return (
      <div style={{ background: BG, color: "#00E5A0", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", flexDirection: "column", gap: 20 }}>
        <div style={{ width: 40, height: 40, border: "3px solid #141E30", borderTop: "3px solid #00E5A0", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <div>SECURING WAYMO DATA LINK...</div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ background: BG, color: "#EF4444", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
        DATA LINK FAILED. CHECK BROWSER CONSOLE.
      </div>
    );
  }

  // Draw the Background Grid
  const renderGrid = () => {
    const lines = [];
    for (let i = 0; i <= mapW; i += 60) lines.push(<line key={`vx-${i}`} x1={i} y1={0} x2={i} y2={mapH} stroke="#00E5A0" strokeWidth={0.5} opacity={0.1} />);
    for (let j = 0; j <= mapH; j += 60) lines.push(<line key={`hx-${j}`} x1={0} y1={j} x2={mapW} y2={j} stroke="#00E5A0" strokeWidth={0.5} opacity={0.1} />);
    return lines;
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: BG, overflow: "hidden", position: "relative", fontFamily: "monospace" }}>
      
      {/* THE MAP SVG */}
      <svg width={dims.w} height={dims.h} style={{ position: "absolute", top: 0, left: 0 }}>
        <g transform={`translate(${ox}, ${oy})`}>
          {/* 1. Draw Grid */}
          {renderGrid()}

          {/* 2. Draw Boroughs via React (No D3 DOM manipulation!) */}
          <g>
            {geoData.features.map((feature, i) => {
              const name = feature.properties.name || feature.properties.NAME || `Borough-${i}`;
              const cohort = getCohort(name);
              const isHovered = hovered?.name === name;

              return (
                <path
                  key={name}
                  d={pathGenerator(feature)}
                  fill={cohort ? cohort.color : UNMAPPED}
                  stroke={isHovered ? "#fff" : (cohort ? "#fff" : UNMAPPED_STROKE)}
                  strokeWidth={isHovered ? 2 : (cohort ? 1 : 0.4)}
                  opacity={isHovered ? 1 : (cohort ? 0.8 : 0.3)}
                  style={{ transition: "all 0.2s ease", cursor: "pointer" }}
                  onMouseEnter={(e) => setHovered({ name, cohort: cohort?.cohortName || "Non-Pilot Area", color: cohort?.color || UNMAPPED, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setHovered(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </g>

          {/* 3. Draw UI Corners */}
          <g stroke="#00E5A0" strokeWidth="2">
            <polyline points={`0,20 0,0 20,0`} fill="none" />
            <polyline points={`${mapW-20},0 ${mapW},0 ${mapW},20`} fill="none" />
            <polyline points={`0,${mapH-20} 0,${mapH} 20,${mapH}`} fill="none" />
            <polyline points={`${mapW-20},${mapH} ${mapW},${mapH} ${mapW},${mapH-20}`} fill="none" />
          </g>
        </g>
      </svg>
      
      {/* HUD Header */}
      <div style={{position:"absolute", top:30, left:40, pointerEvents:"none"}}>
        <div style={{color:"#00E5A0", fontSize:10, letterSpacing:4, fontWeight:800}}>WAYMO // LONDON</div>
        <div style={{color:"#fff", fontSize:28, fontWeight:900}}>Cohort Deployment Map</div>
      </div>

      {/* Side Panel */}
      <div style={{position:"absolute", right:0, top:0, width:"25%", height:"100%", background:"rgba(10,20,30,0.8)", borderLeft:"1px solid #1A3050", padding:40, backdropFilter:"blur(10px)", minWidth: 300}}>
        <div style={{color:"#3A5A7A", fontSize:10, letterSpacing:3, marginBottom:30}}>COHORT CLASSIFICATION</div>
        {Object.entries(COHORTS).map(([name, data]) => (
          <div key={name} style={{marginBottom:25, display:"flex", gap:15}}>
            <div style={{width:40, height:40, background:data.color, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", color: data.color === "#B8D940" ? "#000" : "#fff", fontWeight:900, fontSize: 14}}>L{data.level}</div>
            <div>
              <div style={{color:"#fff", fontSize:13, fontWeight:700}}>{name}</div>
              <div style={{color:"#4A6A8A", fontSize:11, marginTop:4}}>{data.need}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Precision Tooltip */}
      {hovered && (
        <div style={{position:"fixed", left:hovered.x + 20, top:hovered.y - 20, background:"#0B1222", border:"1px solid #00E5A0", padding:"10px 15px", color:"#fff", pointerEvents:"none", zIndex:100, boxShadow:"0 0 20px rgba(0,229,160,0.15)"}}>
          <div style={{fontSize:14, fontWeight:900, marginBottom:4}}>{hovered.name.toUpperCase()}</div>
          <div style={{fontSize:10, color: hovered.color === UNMAPPED ? "#4A6A8A" : "#00E5A0"}}>{hovered.cohort}</div>
        </div>
      )}
    </div>
  );
}