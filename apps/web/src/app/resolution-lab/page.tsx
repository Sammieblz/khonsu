import type { Metadata } from "next";
import { ResolutionLab } from "../../features/viewer/ResolutionLab";

export const metadata: Metadata = {
  title: "Khonsu | Resolution lab",
  description: "Compare native SPHEREx image rendering with the original and a clearly labelled reconstruction control.",
};

export default function ResolutionLabPage() {
  return <ResolutionLab />;
}
