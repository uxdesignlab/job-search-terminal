export type ResumeLane = {
  id: string;
  label: string;
  sourceFile: string;
  status: "source-ready";
};

export const resumeLanes: ResumeLane[] = [
  {
    id: "principal-product-design",
    label: "Principal / Product Design Leadership",
    sourceFile: "assets/resume-principal-product-design.pdf",
    status: "source-ready"
  },
  {
    id: "ux-design",
    label: "UX Design",
    sourceFile: "assets/resume-ux-design.pdf",
    status: "source-ready"
  },
  {
    id: "accessibility-design-systems",
    label: "Accessibility / Design Systems",
    sourceFile: "assets/resume-accessibility.pdf",
    status: "source-ready"
  },
  {
    id: "design-operations",
    label: "Design Operations",
    sourceFile: "assets/resume-operations.pdf",
    status: "source-ready"
  },
  {
    id: "teaching-ux-education",
    label: "Teaching / UX Education",
    sourceFile: "assets/resume-teaching.pdf",
    status: "source-ready"
  }
];
