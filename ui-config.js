const UI_CONFIG = {
  sections: {
    assets: true,
    compare: true,
    marketOverview: true,
    calculator: true,
    research: false,
  },
  subsections: {
    assets: {
      stats: true,
      chart: true,
      returnsTable: true,
    },
    compare: {
      returns: true,
      growth: true,
      excess: true,
      rolling3: true,
      rolling5: true,
      drawdown: true,
      recovery: true,
    },
    marketOverview: {
      heatmap: true,
      returns: true,
      cagr: true,
    },
    calculator: {
      sip: true,
      lumpsum: true,
      swp: true,
    },
    research: {
      quality: true,
      screener: true,
      portfolio: true,
    },
  },
};

if (typeof module === "object" && module.exports) module.exports = UI_CONFIG;