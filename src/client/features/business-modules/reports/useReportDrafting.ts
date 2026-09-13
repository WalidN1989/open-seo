import { useMutation } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  draftReportConclusion,
  readReportFigure,
} from "@/serverFunctions/reports";
import type { ConclusionOptions } from "./ConclusionDrafter";
import type { Engagement } from "./EngagementForm";

/**
 * The two "draft it for me" actions on the report form. Both send the form
 * as it stands, so the model (or the template) sees exactly what the report
 * will, and both write their result back into the form for editing.
 */
export function useReportDrafting(input: {
  projectId: string;
  clientName: string;
  loginEmail: string;
  engagement: Engagement;
  setEngagement: Dispatch<SetStateAction<Engagement>>;
}) {
  const { projectId, clientName, loginEmail, engagement, setEngagement } =
    input;
  const readFigure = useMutation({
    mutationFn: () =>
      readReportFigure({
        data: {
          targetProjectId: projectId,
          clientName: clientName.trim() || "the client",
          figureImages: [
            engagement.figureImage,
            engagement.figureImage2,
          ].filter(Boolean),
        },
      }),
    onSuccess: (reading) => {
      setEngagement((current) => {
        // Captions come back in the order the pictures were sent, which is
        // the order of the filled slots.
        const slots = [current.figureImage, current.figureImage2];
        const captions = [current.figureCaption, current.figureCaption2];
        let next = 0;
        for (const [index, image] of slots.entries()) {
          if (image) {
            captions[index] = reading.captions[next++] ?? captions[index] ?? "";
          }
        }
        return {
          ...current,
          standingIntro: reading.standingIntro,
          figureCaption: captions[0] ?? "",
          figureCaption2: captions[1] ?? "",
          recommendations:
            current.recommendations.trim() || reading.pitch.join("\n"),
        };
      });
    },
  });
  const draftConclusion = useMutation({
    mutationFn: (options: ConclusionOptions) =>
      draftReportConclusion({
        data: {
          ...engagement,
          targetProjectId: projectId,
          clientName: clientName.trim() || "the client",
          loginEmail: loginEmail.trim(),
          ...options,
        },
      }),
    onSuccess: (result) => {
      setEngagement((current) => ({
        ...current,
        conclusion: result.conclusion,
      }));
    },
  });
  return {
    figureReader: {
      run: () => readFigure.mutate(),
      pending: readFigure.isPending,
      error: readFigure.isError
        ? getStandardErrorMessage(readFigure.error)
        : null,
      seen: readFigure.data?.seen ?? [],
    },
    conclusionDrafter: {
      run: (options: ConclusionOptions) => draftConclusion.mutate(options),
      pending: draftConclusion.isPending,
      error: draftConclusion.isError
        ? getStandardErrorMessage(draftConclusion.error)
        : null,
      redFlags: draftConclusion.data?.redFlags ?? [],
    },
  };
}
