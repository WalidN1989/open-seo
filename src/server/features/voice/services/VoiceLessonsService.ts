import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import {
  forgetLesson,
  listLessons,
} from "@/server/features/communications/services/VoiceLearningService";

/** What the workspace's voice agent has learned, for the person to review. */
async function list(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  return listLessons(organizationId);
}

/** Removing a lesson is immediate: the next reply no longer sees it. */
async function forget(
  organizationId: string,
  userId: string,
  input: { lessonId: string },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "manage",
  );
  await forgetLesson(organizationId, input.lessonId);
  return { ok: true as const };
}

export const VoiceLessonsService = { list, forget } as const;
