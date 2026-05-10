import express from "express";
import {
	forgotPassword,
	login,
	checkEmailExists,
	resetPassword,
	testMail,
	sendCode,
	verifyCode,
	verifyResetCode,
	sendResetCode,
	resetPasswordWithCode


} from "../controllers/authController.js";

import { register } from "../controllers/registerController.js";

const router = express.Router();

router.post("/login", login);

router.post("/register", register);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/test-mail", testMail);
router.post("/check-email", checkEmailExists);
router.post("/send-reset-code", sendResetCode);
router.post("/verify-reset-code", verifyResetCode);
router.post("/reset-password-with-code", resetPasswordWithCode);
router.post("/send-code", sendCode);
router.post("/verify-code", verifyCode);

export default router;