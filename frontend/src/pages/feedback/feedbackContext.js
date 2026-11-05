// The signed-in user's feedback access, loaded once by FeedbackLayout (GET /api/feedback/me).
import { createContext, useContext } from "react";

export const FeedbackContext = createContext({ permissions: [], userId: null, role: null, can: () => false, departments: [], departmentList: [], reloadDepartments: () => {}, deptOnly: false });

export function useFeedbackAccess() {
  return useContext(FeedbackContext);
}
