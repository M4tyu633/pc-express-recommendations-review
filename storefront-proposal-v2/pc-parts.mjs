export const partCategories = [
  { kind: "gpu", name: "Graphics Cards" },
  { kind: "cpu", name: "Processors", filters: ["Socket"] },
  { kind: "motherboard", name: "Motherboards", filters: ["Socket", "Memory type", "Form factor"] },
  { kind: "ram", name: "Memory (RAM)", filters: ["Memory type", "Capacity"] },
  { kind: "ssd", name: "Storage (SSDs)", filters: ["Interface", "Capacity"] },
  { kind: "power", name: "Power Supplies" },
  { kind: "cooling", name: "CPU Cooling", filters: ["Cooler type"] },
  { kind: "case", name: "PC Cases", filters: ["Form factor"] },
];

// Sample prices, availability and sales activity for the disconnected demo.
export const demoParts = [
  {
    id: "cpu-7600", kind: "cpu", vendor: "AMD", model: "Ryzen 5 7600", name: "AMD Ryzen 5 7600 Desktop Processor",
    pricePhp: 13050, stock: 7, paidOrdersLast30Days: 13,
    description: "AM5 · 6 cores · Up to 5.1 GHz", keywords: "cpu processor am5 zen 4 ddr5",
    specifications: { Socket: "AM5", Architecture: "Zen 4", Cores: "6", Threads: "12", "Boost clock": "5.1 GHz", "Default TDP": "65 W" },
    accessoryIds: ["board-b650", "cooler-air"],
  },
  {
    id: "cpu-5600g", kind: "cpu", vendor: "AMD", model: "Ryzen 5 5600G", name: "AMD Ryzen 5 5600G Desktop Processor",
    pricePhp: 6950, stock: 5, paidOrdersLast30Days: 15,
    description: "AM4 · 6 cores · Integrated Radeon Graphics", keywords: "cpu processor am4 zen 3 ddr4",
    specifications: { Socket: "AM4", Architecture: "Zen 3", Cores: "6", Threads: "12", "Boost clock": "4.4 GHz", Graphics: "Integrated Radeon Graphics" },
    accessoryIds: ["board-b550", "cooler-air"],
  },
  {
    id: "board-b650", kind: "motherboard", vendor: "ASUS", model: "B650M-AYW WIFI", name: "ASUS B650M-AYW WIFI Micro-ATX Motherboard",
    pricePhp: 7350, stock: 6, paidOrdersLast30Days: 11,
    description: "AM5 · DDR5 · Micro-ATX", keywords: "motherboard mobo b650 amd am5 ddr5",
    specifications: { Socket: "AM5", Chipset: "AMD B650", "Memory type": "DDR5", "Form factor": "Micro-ATX", Storage: "M.2 and SATA", Networking: "Wi-Fi and Ethernet" },
    accessoryIds: ["cpu-7600", "ram-ddr5", "ssd-nv3"],
  },
  {
    id: "board-b550", kind: "motherboard", vendor: "ASRock", model: "B550M Pro4", name: "ASRock B550M Pro4 Micro-ATX Motherboard",
    pricePhp: 5800, stock: 4, paidOrdersLast30Days: 8,
    description: "AM4 · DDR4 · Micro-ATX", keywords: "motherboard mobo b550 amd am4 ddr4",
    specifications: { Socket: "AM4", Chipset: "AMD B550", "Memory type": "DDR4", "Form factor": "Micro-ATX", Storage: "M.2 and SATA", Networking: "Ethernet" },
    accessoryIds: ["cpu-5600g", "ram-ddr4", "ssd-nv3"],
  },
  {
    id: "ram-ddr4", kind: "ram", vendor: "Kingston", model: "KF432C16BB1/16", name: "Kingston FURY Beast 16 GB DDR4-3200 Desktop RAM",
    pricePhp: 9500, stock: 9, paidOrdersLast30Days: 19,
    description: "DDR4 · 16 GB · 3200 MT/s", keywords: "ram memory dimm udimm ddr4 kingston",
    specifications: { "Memory type": "DDR4", Capacity: "16 GB", Speed: "3200 MT/s", Latency: "CL16", Module: "1 × 16 GB UDIMM" },
    accessoryIds: ["board-b550"],
  },
  {
    id: "ram-ddr5", kind: "ram", vendor: "ADATA", model: "AX5U5200C3816G-DCLARBK", name: "ADATA XPG LANCER RGB 32 GB DDR5-5200 Desktop RAM",
    pricePhp: 30000, stock: 5, paidOrdersLast30Days: 10,
    description: "DDR5 · 32 GB · 5200 MT/s", keywords: "ram memory dimm udimm ddr5 adata xpg",
    specifications: { "Memory type": "DDR5", Capacity: "32 GB", Speed: "5200 MT/s", Latency: "CL38", Module: "2 × 16 GB UDIMM" },
    accessoryIds: ["board-b650"],
  },
  {
    id: "ssd-nv3", kind: "ssd", vendor: "Kingston", model: "SNV3S/1000G", name: "Kingston NV3 1 TB M.2 NVMe SSD",
    pricePhp: 4950, stock: 12, paidOrdersLast30Days: 24,
    description: "1 TB · PCIe 4.0 NVMe · M.2 2280", keywords: "storage ssd solid state nvme m2 m.2 drive",
    specifications: { Capacity: "1 TB", Interface: "PCIe 4.0 NVMe", "Form factor": "M.2 2280", "Sequential read": "Up to 6000 MB/s", "Sequential write": "Up to 4000 MB/s" },
  },
  {
    id: "ssd-kc600", kind: "ssd", vendor: "Kingston", model: "SKC600/512G", name: "Kingston KC600 512 GB SATA SSD",
    pricePhp: 3250, stock: 6, paidOrdersLast30Days: 16,
    description: "512 GB · SATA · 2.5″", keywords: "storage ssd solid state sata 2.5 drive",
    specifications: { Capacity: "512 GB", Interface: "SATA", "Form factor": "2.5″", "Sequential read": "Up to 550 MB/s", "Sequential write": "Up to 520 MB/s" },
  },
  {
    id: "cooler-air", kind: "cooling", vendor: "Cooler Master", model: "RR-S4NA-17PA-R1", name: "Cooler Master Hyper 212 Spectrum V3 CPU Cooler",
    pricePhp: 1300, stock: 8, paidOrdersLast30Days: 15,
    description: "Tower air cooler · AM4, AM5 and LGA1700", keywords: "cooling cpu heatsink tower fan air cooler",
    specifications: { "Cooler type": "Air", "Socket support": "AM4, AM5, LGA1700 and LGA1200", Height: "152 mm", Fans: "1 × 120 mm", Lighting: "ARGB" },
  },
  {
    id: "cooler-liquid", kind: "cooling", vendor: "MSI", model: "MAG CORELIQUID A15 240", name: "MSI MAG CORELIQUID A15 240 Liquid CPU Cooler",
    pricePhp: 3950, stock: 0, paidOrdersLast30Days: 7,
    description: "240 mm AIO liquid cooler · Dual 120 mm fans", keywords: "cooling cpu liquid water aio radiator",
    specifications: { "Cooler type": "Liquid (AIO)", Radiator: "240 mm", Fans: "2 × 120 mm", "Radiator material": "Aluminum", "Radiator dimensions": "277 × 119.6 × 27 mm" },
  },
  {
    id: "case-mini", kind: "case", vendor: "Antec", model: "CX200M RGB ELITE", name: "Antec CX200M RGB Elite Mini-Tower PC Case",
    pricePhp: 2450, stock: 7, paidOrdersLast30Days: 12,
    description: "Micro-ATX mini tower · Dual chamber", keywords: "case chassis pc enclosure mATX mini tower",
    specifications: { "Form factor": "Micro-ATX", "Case size": "Mini tower", Layout: "Dual chamber", Side: "Tempered glass", Color: "Black" },
    accessoryIds: ["board-b550", "board-b650"],
  },
  {
    id: "case-atx", kind: "case", vendor: "Cooler Master", model: "CP520-KGNN-S00", name: "Cooler Master CMP 520 ATX Mid-Tower PC Case",
    pricePhp: 3690, stock: 4, paidOrdersLast30Days: 9,
    description: "ATX mid tower · Mesh front panel", keywords: "case chassis pc enclosure atx mid tower",
    specifications: { "Form factor": "ATX", "Case size": "Mid tower", "Front panel": "Mesh", Side: "Tempered glass", Color: "Black" },
    accessoryIds: ["board-b550", "board-b650"],
  },
].map(product => ({
  ...product,
  category: { ram: "memory", ssd: "storage", case: "pc cases", cooling: "cpu cooling" }[product.kind]
    ?? partCategories.find(category => category.kind === product.kind).name.toLowerCase(),
  image: product.id + ".jpg",
  inStock: product.stock > 0,
  published: true,
  addedAtMs: Date.UTC(2026, 10, 13),
}));
