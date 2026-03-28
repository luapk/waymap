import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

/* ── GeoJSON Sources (real ONS borough boundaries) ────────────────── */
const SOURCES = [
  { url: "https://raw.githubusercontent.com/radoi90/housequest-data/master/london_boroughs.geojson", nameKey: "name" },
  { url: "https://raw.githubusercontent.com/westminsterDataStudio/open_data/main/boundary_files/boroughs_london.geojson", nameKey: "NAME" },
];

/* ── Cohort definitions ───────────────────────────────────────────── */
const COHORTS = {
  "The Frictionless Native": { color: "#0066FF", glow: "#0066FF50", boroughs: ["Camden","Islington","Southwark"], need: "Seamless digital integration", level: 2 },
  "The Privacy Premium": { color: "#0D1B2A", stroke: "#2A4F6F", glow: "none", boroughs: ["Westminster","City of London","Kensington and Chelsea"], need: "Silence, privacy, consistency", level: 1 },
  "The 3AM Londoner": { color: "#00E5A0", glow: "#00E5A040", boroughs: ["Hackney","Tower Hamlets","Lambeth"], need: "Safety when options vanish", level: 3 },
  "The Last Mile Londoner": { color: "#B8D940", glow: "#B8D94030", boroughs: ["Barking and Dagenham","Newham","Lewisham","Croydon"], need: "First/last mile to rail", level: 4 },
};

const OVERLAYS = {
  "The Visitor": { color: "#8B95B0", need: "Navigation & confidence", level: 5 },
  "The Accessibility Dependent": { color: "#E8B4B4", need: "Door-to-door without barriers", level: 5 },
};

const BG = "#060B14";
const UNMAPPED = "#0A1018";
const UNMAPPED_STROKE = "#121E2E";

function getCohort(boroughName) {
  const n = boroughName.toLowerCase();
  for (const [k, v] of Object.entries(COHORTS)) {
    if (v.boroughs.some(b => n.includes(b.toLowerCase()) || b.toLowerCase().includes(n)))
      return { cohortName: k, ...v };
  }
  return null;
}

function getName(feature, nameKey) {
  return feature.properties[nameKey] || feature.properties.name || feature.properties.NAME || "Unknown";
}

async function fetchGeo() {
  for (const src of SOURCES) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const resp = await fetch(src.url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data?.features?.length > 20) {
        return { geo: data, nameKey: src.nameKey, source: src.url };
      }
    } catch (e) { /* try next */ }
  }
  throw new Error("All sources failed");
}

export default function WaymoMap() {
  const svgRef = useRef(null);
  const [geo, setGeo] = useState(null);
  const [nameKey, setNameKey] = useState("name");
  const [status, setStatus] = useState("loading");
  const [hovered, setHovered] = useState(null);
  const [dims, setDims] = useState({ w: 0, h: 0 }); // Initialize at 0 for SSR
  const hovRef = useRef(null);

  // Handle Resize & Initial Client-side Dimensioning
  useEffect(() => {
    const handleResize = () => {
      setDims({ w: window.innerWidth, h: window.innerHeight });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch GeoData on Mount
  useEffect(() => {
    setStatus("loading");
    fetchGeo()
      .then(({ geo, nameKey }) => { 
        setGeo(geo); 
        setNameKey(nameKey); 
        setStatus("ok"); 
      })
      .catch(() => setStatus("error"));
  }, []);

  const drawMap = useCallback(() => {
    if (!geo || !svgRef.current || dims.w === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { w, h } = dims;
    const mapW = w * 0.6, mapH = h * 0.82;
    const ox = w * 0.05, oy = h * 0.1;

    const projection = d3.geoMercator().fitSize([mapW, mapH], geo);
    const path = d3.geoPath().projection(projection);

    const defs = svg.append("defs");

    // Glow filters per cohort color
    ["#0066FF","#00E5A0","#B8D940"].forEach((c, i) => {
      const f = defs.append("filter").attr("id", `gl${i}`).attr("x","-40%").attr("y","-40%").attr("width","180%").attr("height","180%");
      f.append("feGaussianBlur").attr("in","SourceGraphic").attr("stdDeviation","5").attr("result","b");
      f.append("feFlood").attr("flood-color", c).attr("flood-opacity","0.15").attr("result","c");
      f.append("feComposite").attr("in","c").attr("in2","b").attr("operator","in").attr("result","gc");
      const m = f.append("feMerge");
      m.append("feMergeNode").attr("in","gc");
      m.append("feMergeNode").attr("in","SourceGraphic");
    });

    const glowMap = {"#0066FF":"gl0","#00E5A0":"gl1","#B8D940":"gl2"};

    // Grid
    const g = svg.append("g").attr("transform",`translate(${ox},${oy})`);
    const gridG = g.append("g").attr("opacity",0.04);
    for(let i=0;i<mapW;i+=50) gridG.append("line").attr("x1",i).attr("y1",0).attr("x2",i).attr("y2",mapH).attr("stroke","#1A4060").attr("stroke-width",0.4).attr("stroke-dasharray","2,4");
    for(let j=0;j<mapH;j+=50) gridG.append("line").attr("x1",0).attr("y1",j).attr("x2",mapW).attr("y2",j).attr("stroke","#1A4060").attr("stroke-width",0.4).attr("stroke-dasharray","2,4");

    // Boroughs
    const boroughG = g.append("g");
    const labelG = g.append("g");

    geo.features.forEach(f => {
      const bName = getName(f, nameKey);
      const c = getCohort(bName);
      const fill = c ? c.color : UNMAPPED;
      const stroke = c ? (c.stroke || d3.color(c.color).brighter(0.3).toString()) : UNMAPPED_STROKE;
      const op = c ? 0.9 : 0.25;
      const filterId = c ? glowMap[c.color] : null;

      boroughG.append("path")
        .datum(f)
        .attr("d", path)
        .attr("fill", fill)
        .attr("stroke", stroke)
        .attr("stroke-width", c ? 1.2 : 0.4)
        .attr("opacity", op)
        .attr("filter", filterId ? `url(#${filterId})` : null)
        .style("cursor","pointer")
        .style("transition","opacity 0.15s, stroke-width 0.15s")
        .on("mouseenter", function(e) {
          d3.select(this).raise().attr("opacity",1).attr("stroke","#fff").attr("stroke-width",2);
          hovRef.current = { name: bName, cohort: c?.cohortName||"Not in pilot zone", need: c?.need||"—", color: c?.color||UNMAPPED, x: e.clientX, y: e.clientY };
          setHovered({...hovRef.current});
        })
        .on("mousemove", function(e) {
          if(hovRef.current) { hovRef.current.x=e.clientX; hovRef.current.y=e.clientY; setHovered({...hovRef.current}); }
        })
        .on("mouseleave", function() {
          d3.select(this).attr("opacity",op).attr("stroke",stroke).attr("stroke-width",c?1.2:0.4);
          hovRef.current=null; setHovered(null);
        });

      if (c) {
        const [cx, cy] = path.centroid(f);
        if (cx && cy && !isNaN(cx)) {
          const area = path.area(f);
          const fontSize = area > 3000 ? 8 : area > 1500 ? 7 : 6;
          const label = bName.length > 16 ? bName.slice(0,15)+"…" : bName;
          const tc = c.color==="#0D1B2A" ? "#3A5A7A" : c.color==="#B8D940" ? "#1A2744" : "rgba(255,255,255,0.85)";
          labelG.append("text").attr("x",cx).attr("y",cy).attr("text-anchor","middle").attr("dominant-baseline","central")
            .attr("font-family","'Fira Code',monospace").attr("font-size",fontSize).attr("font-weight",600)
            .attr("fill",tc).attr("pointer-events","none").attr("letter-spacing","0.5px").text(label);
        }
      }
    });

    // Frame UI
    const cs = 18;
    [[0,0,1,1],[mapW,0,-1,1],[0,mapH,1,-1],[mapW,mapH,-1,-1]].forEach(([x,y,sx,sy])=>{
      g.append("line").attr("x1",x).attr("y1",y).attr("x2",x+cs*sx).attr("y2",y).attr("stroke","#00E5A0").attr("stroke-width",1).attr("opacity",0.3);
      g.append("line").attr("x1",x).attr("y1",y).attr("x2",x).attr("y2",y+cs*sy).attr("stroke","#00E5A0").attr("stroke-width",1).attr("opacity",0.3);
    });

    const tickG = g.append("g").attr("opacity",0.15);
    const inv = projection.invert;
    if(inv) {
      for(let px=0;px<mapW;px+=mapW/6){
        const [lng] = inv([px,mapH/2]);
        tickG.append("text").attr("x",px).attr("y",mapH+14).attr("text-anchor","middle")
          .attr("font-family","'Fira Code',monospace").attr("font-size",6).attr("fill","#2A4060")
          .text(`${lng.toFixed(2)}°`);
      }
      for(let py=0;py<mapH;py+=mapH/5){
        const [,lat] = inv([mapW/2,py]);
        tickG.append("text").attr("x",-6).attr("y",py+3).attr("text-anchor","end")
          .attr("font-family","'Fira Code',monospace").attr("font-size",6).attr("fill","#2A4060")
          .text(`${lat.toFixed(2)}°`);
      }
    }
  }, [geo, nameKey, dims]);

  useEffect(() => { drawMap(); }, [drawMap]);

  if (dims.w === 0 || status === "loading") return (
    <div style={{ width:"100vw",height:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,fontFamily:"monospace" }}>
      <div style={{ width:40,height:40,border:"2px solid #141E30",borderTop:"2px solid #00E5A0",borderRadius:"50%",animation:"spin 1s linear infinite" }}/>
      <div style={{fontSize:10,color:"#2A4060",letterSpacing:3}}>LOADING SYSTEM GEOMETRY</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (status === "error") return (
    <div style={{ width:"100vw",height:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,fontFamily:"monospace" }}>
      <div style={{fontSize:11,color:"#EF4444"}}>BOUNDARY DATA ERROR</div>
    </div>
  );

  const { w, h } = dims;
  const lx = w * 0.7, ly = h * 0.08;

  return (
    <div style={{ width:"100vw",height:"100vh",background:BG,overflow:"hidden",position:"relative",fontFamily:"'Fira Code',monospace" }}>
      <svg ref={svgRef} width={w} height={h} style={{position:"absolute",top:0,left:0}} />

      {/* Header */}
      <div style={{position:"absolute",top:h*0.02,left:w*0.05,pointerEvents:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:5}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#00E5A0",boxShadow:"0 0 10px #00E5A0"}}/>
          <span style={{fontSize:9,letterSpacing:5,color:"#00E5A0",fontWeight:700}}>WAYMO · LONDON</span>
        </div>
        <div style={{fontSize:22,fontWeight:800,color:"#E2E8F0",letterSpacing:0.5}}>Cohort Deployment Map</div>
        <div style={{fontSize:8,color:"#1E3450",marginTop:3,letterSpacing:2}}>PILOT BOROUGH TARGETING · 2026</div>
      </div>

      {/* Legend */}
      <div style={{position:"absolute",top:ly,left:lx,width:w*0.26,background:"rgba(6,11,20,0.85)",borderLeft:"1px solid #141E30",padding:"16px 20px",height:h*0.84,overflowY:"auto"}}>
        <div style={{fontSize:8,letterSpacing:4,color:"#1E3450",fontWeight:700,marginBottom:18,borderBottom:"1px solid #0E1A28",paddingBottom:8}}>COHORT SYSTEM</div>
        {Object.entries(COHORTS).map(([name,data])=>(
          <div key={name} style={{marginBottom:16,display:"flex",gap:10}}>
            <div style={{width:34,height:34,borderRadius:5,background:data.color,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{color:data.color==="#B8D940"?"#0E1A28":"#fff",fontSize:11,fontWeight:800}}>L{data.level}</span>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#C0C8D8"}}>{name}</div>
              <div style={{fontSize:8,color:"#3A5A7A"}}>{data.need}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hovered && (
        <div style={{position:"fixed",left:Math.min(hovered.x+16,w-220),top:hovered.y-10,background:"#0B1222ee",border:"1px solid #1A3050",borderRadius:6,padding:"10px 14px",pointerEvents:"none",zIndex:100,backdropFilter:"blur(8px)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:10,height:10,borderRadius:2,background:hovered.color}}/>
            <span style={{fontSize:12,fontWeight:700,color:"#E2E8F0"}}>{hovered.name}</span>
          </div>
          <div style={{fontSize:9,color:"#00E5A0",marginTop:4}}>{hovered.cohort}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{position:"absolute",bottom:h*0.02,left:w*0.05,display:"flex",gap:16,opacity:0.4}}>
        <span style={{fontSize:7,color:"#fff",letterSpacing:2.5}}>adam&eveTBWA · CONFIDENTIAL</span>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600;700&display=swap');
      `}</style>
    </div>
  );
}