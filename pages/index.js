"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

// Added a highly-reliable backup source specifically for WGS84 London bounds
const SOURCES = [
  { url: "https://raw.githubusercontent.com/radoi90/housequest-data/master/london_boroughs.geojson", nameKey: "name" },
  { url: "https://skgrange.github.io/www/data/london_boroughs.json", nameKey: "name" }
];

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
    if (v.boroughs.some(b => n.includes(b.toLowerCase()) || b.toLowerCase().includes(n)))
      return { cohortName: k, ...v };
  }
  return null;
}

// Safely extracts a single raw coordinate to test the projection type
const getSampleCoordinate = (feature) => {
  let coords = feature?.geometry?.coordinates;
  while (coords && Array.isArray(coords[0])) {
    coords = coords[0];
  }
  return coords || [0, 0];
};

export default function WaymoMap() {
  const svgRef = useRef(null);
  const [geo, setGeo] = useState(null);
  const [status, setStatus] = useState("loading");
  const [hovered, setHovered] = useState(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const handleResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    handleResize(); 
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const fetchGeo = async () => {
      for (const src of SOURCES) {
        try {
          const resp = await fetch(src.url);
          if (!resp.ok) continue;
          const data = await resp.json();
          
          // CRITICAL: Sanitize the GeoJSON before saving to state
          if (data && data.features) {
            const validFeatures = data.features.filter(f => f && f.geometry && f.geometry.coordinates);
            if (validFeatures.length > 0) {
              setGeo({ type: "FeatureCollection", features: validFeatures, nameKey: src.nameKey });
              setStatus("ok");
              return;
            }
          }
        } catch (e) {
          console.warn("Source failed, attempting backup...");
        }
      }
      setStatus("error");
    };
    fetchGeo();
  }, []);

  const drawMap = useCallback(() => {
    if (!geo || !svgRef.current || dims.w === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const mapW = dims.w * 0.65;
    const mapH = dims.h * 0.85;
    const ox = dims.w * 0.02;
    const oy = dims.h * 0.08;

    // Bulletproof Projection Logic
    let projection;
    try {
      const sampleCoord = getSampleCoordinate(geo.features[0]);
      // If the coordinate is massive (> 1000), it's a British National Grid projection. Otherwise, it's standard Lat/Lon.
      const isBNG = Math.abs(sampleCoord[0]) > 1000; 

      projection = isBNG 
        ? d3.geoIdentity().reflectY(true).fitExtent([[50, 50], [mapW - 50, mapH - 50]], geo)
        : d3.geoMercator().fitExtent([[50, 50], [mapW - 50, mapH - 50]], geo);
        
    } catch (err) {
      console.error("Projection mapping failed. Defaulting to manual Mercator.", err);
      // Hard fallback to London center
      projection = d3.geoMercator().center([-0.1276, 51.5073]).scale(60000).translate([mapW/2, mapH/2]);
    }

    const path = d3.geoPath().projection(projection);

    const g = svg.append("g").attr("transform", `translate(${ox},${oy})`);

    // Background Grid
    const gridG = g.append("g").attr("opacity", 0.05);
    for (let i = 0; i <= mapW; i += 60) gridG.append("line").attr("x1", i).attr("y1", 0).attr("x2", i).attr("y2", mapH).attr("stroke", "#00E5A0").attr("stroke-width", 0.5);
    for (let j = 0; j <= mapH; j += 60) gridG.append("line").attr("x1", 0).attr("y1", j).attr("x2", mapW).attr("y2", j).attr("stroke", "#00E5A0").attr("stroke-width", 0.5);

    const boroughG = g.append("g");

    // Draw Map Paths
    geo.features.forEach(f => {
      const name = f.properties[geo.nameKey] || f.properties.name || f.properties.NAME || "Unknown";
      const cohort = getCohort(name);
      
      boroughG.append("path")
        .datum(f)
        .attr("d", path)
        .attr("fill", cohort ? cohort.color : UNMAPPED)
        .attr("stroke", cohort ? "#fff" : UNMAPPED_STROKE)
        .attr("stroke-width", cohort ? 1 : 0.3)
        .attr("opacity", cohort ? 0.8 : 0.3)
        .style("transition", "opacity 0.2s ease, stroke-width 0.2s ease")
        .on("mouseenter", function(e) {
          d3.select(this).raise().attr("opacity", 1).attr("stroke-width", 2);
          setHovered({ name, cohort: cohort?.cohortName || "Non-Pilot Area", color: cohort?.color || UNMAPPED, x: e.clientX, y: e.clientY });
        })
        .on("mousemove", (e) => setHovered(h => h ? { ...h, x: e.clientX, y: e.clientY } : null))
        .on("mouseleave", function() {
          d3.select(this).attr("opacity", cohort ? 0.8 : 0.3).attr("stroke-width", cohort ? 1 : 0.3);
          setHovered(null);
        });
    });

    // Frame UI Corners
    const cs = 20;
    const corners = [[0,0,1,1], [mapW,0,-1,1], [0,mapH,1,-1], [mapW,mapH,-1,-1]];
    corners.forEach(([x,y,sx,sy]) => {
      g.append("line").attr("x1",x).attr("y1",y).attr("x2",x+cs*sx).attr("y2",y).attr("stroke","#00E5A0").attr("stroke-width",2);
      g.append("line").attr("x1",x).attr("y1",y).attr("x2",x).attr("y2",y+cs*sy).attr("stroke","#00E5A0").attr("stroke-width",2);
    });

  }, [geo, dims]);

  useEffect(() => { drawMap(); }, [drawMap]);

  if (status === "loading") return <div style={{background:BG, color:"#00E5A0", height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace"}}>INITIALIZING SECURE DATA LINK...</div>;
  if (status === "error") return <div style={{background:BG, color:"#EF4444", height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace"}}>COULD NOT FETCH GEOJSON DATA.</div>;

  return (
    <div style={{ width: "100vw", height: "100vh", background: BG, overflow: "hidden", position: "relative", fontFamily: "monospace" }}>
      <svg ref={svgRef} width={dims.w} height={dims.h} />
      
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
            <div style={{width:40, height:40, background:data.color, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", color: data.color === "#B8D940" ? "#000" : "#fff", fontWeight:900}}>L{data.level}</div>
            <div>
              <div style={{color:"#fff", fontSize:12, fontWeight:700}}>{name}</div>
              <div style={{color:"#4A6A8A", fontSize:10, marginTop:4}}>{data.need}</div>
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