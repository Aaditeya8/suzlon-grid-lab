/* projects.js — Suzlon Grid Lab dataset.
   SYNTHETIC but realistic: real site coordinates, capacities, turbine models and conductor
   specs from public materials; evacuation progress figures are indicative (demo data).
   Unofficial concept lab — not affiliated with Suzlon Energy Ltd.
   Swap this single file for a real MIS feed to make the tool live.

   v2: every farm runs one of the two current platforms — S144 (3.0 MW, 140 m Hybrid
   Lattice Tower) for new / under-construction builds, or S120 (2.1 MW, tubular) for the
   older energized fleet. Per-turbine EPC stage is generated at runtime in app.js. */
window.GRID_DATA = {
  meta: {
    title: "Suzlon Grid Lab",
    subtitle: "Wind Power Evacuation — Implementation Command Center",
    asOf: "Jun 2026",
    asOfDate: "2026-06-17",       // anchor for the per-stage execution timeline / ageing
    indiaWindGW: 53.6,            // total installed wind, India (Oct 2025)
    suzlonInstalledGW: 20.1,      // Suzlon cumulative installed
    target2030GW: 140,            // national wind target by 2030
    note: "Indicative demo data grounded in public materials."
  },

  // ACSR overhead conductors — the 'animal' codenames used on 33 kV evacuation lines.
  conductors: {
    Dog:     { al_mm2: 100, strand: "6 Al / 7 St", dia_mm: 14.15, r_ohm_km: 0.273, amp: 290,  kv: "11 / 33", kg_km: 394, role: "Short 33 kV collector spurs & laterals" },
    Panther: { al_mm2: 200, strand: "30 Al / 7 St", dia_mm: 21.0,  r_ohm_km: 0.140, amp: 560,  kv: "33 / 66 / 132", kg_km: 974, role: "Main 33 kV evacuation spine (long, high-load runs)" }
  },

  // Suzlon turbine platforms (rated MW / rotor m / typical hub m). v2 deploys S144 + S120.
  turbines: {
    S144: { mw: 3.0,  rotor: 144,  hub: 140, tower: "HLT",     status: "Flagship — 140 m Hybrid Lattice Tower" },
    S120: { mw: 2.1,  rotor: 120,  hub: 120, tower: "tubular", status: "Current — tubular steel tower" }
  },

  // status: planned | construction | commissioned | energized
  //   commissioned = turbines erected but evacuation not fully live (stranded risk)
  //   energized    = exporting at full evacuation capacity
  projects: [
    { id:"jaisalmer",  name:"Jaisalmer Wind Park",        state:"Rajasthan",      district:"Jaisalmer",  lat:26.92, lon:70.90, capacityMW:1064, turbineModel:"S120", status:"energized",
      commissioning:"FY19", progressPct:100, seed:101,
      substation:{ name:"Amarsagar Pooling SS", type:"33/220 kV", mva:"3×160", status:"energized", progressPct:100 },
      lines:[ {conductor:"Panther", lengthKm:28, strungKm:28, towers:112, status:"energized"},
              {conductor:"Dog", lengthKm:64, strungKm:64, towers:0, status:"energized"} ] },

    { id:"fatehgarh",  name:"Fatehgarh Cluster",          state:"Rajasthan",      district:"Jaisalmer",  lat:27.10, lon:71.60, capacityMW:402, turbineModel:"S144", status:"construction",
      commissioning:"Q4 FY26", progressPct:64, seed:102,
      substation:{ name:"Fatehgarh-III PS", type:"33/220 kV", mva:"2×160", status:"construction", progressPct:55 },
      lines:[ {conductor:"Panther", lengthKm:22, strungKm:16, towers:88, status:"construction"},
              {conductor:"Dog", lengthKm:41, strungKm:24, towers:0, status:"construction"} ] },

    { id:"barmer",     name:"Barmer Cluster (Aditya Birla)", state:"Rajasthan",   district:"Barmer",     lat:25.70, lon:71.40, capacityMW:368, turbineModel:"S144", status:"construction",
      commissioning:"Q1 FY27", progressPct:41, seed:103,
      substation:{ name:"Barmer PS", type:"33/132 kV", mva:"2×100", status:"construction", progressPct:30 },
      lines:[ {conductor:"Panther", lengthKm:31, strungKm:12, towers:124, status:"construction"},
              {conductor:"Dog", lengthKm:38, strungKm:14, towers:0, status:"construction"} ] },

    { id:"tejuva",     name:"Tejuva (CLP India)",         state:"Rajasthan",      district:"Jaisalmer",  lat:26.85, lon:70.85, capacityMW:100.8, turbineModel:"S120", status:"energized",
      commissioning:"FY18", progressPct:100, seed:104,
      substation:{ name:"Tejuva SS", type:"33/132 kV", mva:"2×80", status:"energized", progressPct:100 },
      lines:[ {conductor:"Panther", lengthKm:14, strungKm:14, towers:56, status:"energized"},
              {conductor:"Dog", lengthKm:22, strungKm:22, towers:0, status:"energized"} ] },

    { id:"kutch",      name:"Kutch Wind Park",            state:"Gujarat",        district:"Kutch",      lat:23.20, lon:69.50, capacityMW:1100, turbineModel:"S120", status:"energized",
      commissioning:"FY20", progressPct:100, seed:105,
      substation:{ name:"Nani Sindholi PS", type:"33/220 kV", mva:"3×160", status:"energized", progressPct:100 },
      lines:[ {conductor:"Panther", lengthKm:34, strungKm:34, towers:136, status:"energized"},
              {conductor:"Dog", lengthKm:71, strungKm:71, towers:0, status:"energized"} ] },

    { id:"bhuj",       name:"Bhuj Cluster (Aditya Birla)", state:"Gujarat",       district:"Kutch",      lat:23.45, lon:69.78, capacityMW:182, turbineModel:"S144", status:"commissioned",
      commissioning:"Q2 FY26", progressPct:88, seed:106,
      substation:{ name:"Bhuj-II PS", type:"33/132 kV", mva:"2×100", status:"commissioned", progressPct:80 },
      lines:[ {conductor:"Panther", lengthKm:19, strungKm:19, towers:76, status:"energized"},
              {conductor:"Dog", lengthKm:27, strungKm:23, towers:0, status:"construction"} ] },

    { id:"vankusawade", name:"Vankusawade Wind Park",     state:"Maharashtra",    district:"Satara",     lat:17.46, lon:73.83, capacityMW:210, turbineModel:"S120", status:"energized",
      commissioning:"FY12", progressPct:100, seed:107,
      substation:{ name:"Vankusawade SS", type:"33/132 kV", mva:"2×100", status:"energized", progressPct:100 },
      lines:[ {conductor:"Panther", lengthKm:17, strungKm:17, towers:68, status:"energized"},
              {conductor:"Dog", lengthKm:29, strungKm:29, towers:0, status:"energized"} ] },

    { id:"brahmanvel", name:"Brahmanvel Wind Farm",       state:"Maharashtra",    district:"Dhule",      lat:21.25, lon:74.30, capacityMW:528, turbineModel:"S144", status:"commissioned",
      commissioning:"Q3 FY26", progressPct:79, seed:108,
      substation:{ name:"Dhule PS", type:"33/220 kV", mva:"2×160", status:"construction", progressPct:62 },
      lines:[ {conductor:"Panther", lengthKm:26, strungKm:24, towers:104, status:"commissioned"},
              {conductor:"Dog", lengthKm:48, strungKm:33, towers:0, status:"construction"} ] },

    { id:"dhalgaon",   name:"Dhalgaon / Sangli Cluster",  state:"Maharashtra",    district:"Sangli",     lat:17.00, lon:74.50, capacityMW:278, turbineModel:"S120", status:"energized",
      commissioning:"FY21", progressPct:100, seed:109,
      substation:{ name:"Sangli PS", type:"33/132 kV", mva:"2×100", status:"energized", progressPct:100 },
      lines:[ {conductor:"Panther", lengthKm:18, strungKm:18, towers:72, status:"energized"},
              {conductor:"Dog", lengthKm:33, strungKm:33, towers:0, status:"energized"} ] },

    { id:"muppandal",  name:"Muppandal–Aralvaimozhi",     state:"Tamil Nadu",     district:"Kanyakumari",lat:8.25, lon:77.59, capacityMW:1500, turbineModel:"S120", status:"energized",
      commissioning:"FY17", progressPct:100, seed:110,
      substation:{ name:"Aralvaimozhi PS", type:"33/230 kV", mva:"4×160", status:"energized", progressPct:100 },
      lines:[ {conductor:"Panther", lengthKm:39, strungKm:39, towers:156, status:"energized"},
              {conductor:"Dog", lengthKm:88, strungKm:88, towers:0, status:"energized"} ] },

    { id:"kayathar",   name:"Kayathar Wind Farm",         state:"Tamil Nadu",     district:"Thoothukudi",lat:8.95, lon:77.85, capacityMW:300, turbineModel:"S144", status:"commissioned",
      commissioning:"Q2 FY26", progressPct:84, seed:111,
      substation:{ name:"Kayathar PS", type:"33/132 kV", mva:"2×100", status:"commissioned", progressPct:75 },
      lines:[ {conductor:"Panther", lengthKm:21, strungKm:21, towers:84, status:"energized"},
              {conductor:"Dog", lengthKm:36, strungKm:28, towers:0, status:"construction"} ] },

    { id:"gadag",      name:"Gadag Wind Project",         state:"Karnataka",      district:"Gadag",      lat:15.42, lon:75.65, capacityMW:302, turbineModel:"S144", status:"construction",
      commissioning:"Q1 FY27", progressPct:48, seed:112,
      substation:{ name:"Gadag PS", type:"33/220 kV", mva:"2×160", status:"construction", progressPct:38 },
      lines:[ {conductor:"Panther", lengthKm:24, strungKm:12, towers:96, status:"construction"},
              {conductor:"Dog", lengthKm:40, strungKm:18, towers:0, status:"construction"} ] },

    { id:"chitradurga",name:"Chitradurga Cluster",        state:"Karnataka",      district:"Chitradurga",lat:14.05, lon:76.47, capacityMW:120, turbineModel:"S120", status:"commissioned",
      commissioning:"Q1 FY26", progressPct:90, seed:113,
      substation:{ name:"Chitradurga SS", type:"33/132 kV", mva:"2×80", status:"energized", progressPct:100 },
      lines:[ {conductor:"Panther", lengthKm:15, strungKm:15, towers:60, status:"energized"},
              {conductor:"Dog", lengthKm:24, strungKm:20, towers:0, status:"construction"} ] },

    { id:"anantapur",  name:"Anantapur Wind Farm",        state:"Andhra Pradesh", district:"Anantapur",  lat:14.68, lon:77.60, capacityMW:226.8, turbineModel:"S120", status:"energized",
      commissioning:"FY19", progressPct:100, seed:114,
      substation:{ name:"Anantapur PS", type:"33/220 kV", mva:"2×160", status:"energized", progressPct:100 },
      lines:[ {conductor:"Panther", lengthKm:23, strungKm:23, towers:92, status:"energized"},
              {conductor:"Dog", lengthKm:35, strungKm:35, towers:0, status:"energized"} ] },

    { id:"kurnool",    name:"Kurnool Cluster",            state:"Andhra Pradesh", district:"Kurnool",    lat:15.83, lon:78.04, capacityMW:200, turbineModel:"S144", status:"construction",
      commissioning:"Q4 FY26", progressPct:52, seed:115,
      substation:{ name:"Kurnool PS", type:"33/132 kV", mva:"2×100", status:"construction", progressPct:45 },
      lines:[ {conductor:"Panther", lengthKm:20, strungKm:11, towers:80, status:"construction"},
              {conductor:"Dog", lengthKm:31, strungKm:15, towers:0, status:"construction"} ] },

    { id:"ratlam",     name:"Ratlam Wind Farm",           state:"Madhya Pradesh", district:"Ratlam",     lat:23.30, lon:75.10, capacityMW:100, turbineModel:"S144", status:"construction",
      commissioning:"Q3 FY26", progressPct:58, seed:116,
      substation:{ name:"Ratlam SS", type:"33/132 kV", mva:"2×80", status:"construction", progressPct:50 },
      lines:[ {conductor:"Panther", lengthKm:13, strungKm:8, towers:52, status:"construction"},
              {conductor:"Dog", lengthKm:21, strungKm:11, towers:0, status:"construction"} ] },

    { id:"dewas",      name:"Dewas / Mahuria Cluster",    state:"Madhya Pradesh", district:"Dewas",      lat:22.95, lon:76.10, capacityMW:150, turbineModel:"S144", status:"planned",
      commissioning:"Q3 FY27", progressPct:8, seed:117,
      substation:{ name:"Dewas PS", type:"33/132 kV", mva:"2×100", status:"planned", progressPct:0 },
      lines:[ {conductor:"Panther", lengthKm:18, strungKm:0, towers:72, status:"planned"},
              {conductor:"Dog", lengthKm:26, strungKm:0, towers:0, status:"planned"} ] },

    { id:"kutch2",     name:"Kutch Phase-II (Pipeline)",  state:"Gujarat",        district:"Kutch",      lat:23.62, lon:69.32, capacityMW:300, turbineModel:"S144", status:"planned",
      commissioning:"Q2 FY28", progressPct:5, seed:118,
      substation:{ name:"Khavda PS", type:"33/400 kV", mva:"3×500", status:"planned", progressPct:0 },
      lines:[ {conductor:"Panther", lengthKm:33, strungKm:0, towers:132, status:"planned"},
              {conductor:"Dog", lengthKm:44, strungKm:0, towers:0, status:"planned"} ] }
  ]
};
