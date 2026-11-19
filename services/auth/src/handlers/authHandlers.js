import { AppError } from "@bookstore/common/errors/AppError";
import { grpcHandler } from "@bookstore/common/errors/grpcStatus";

const EMPTY_STRING = "";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

const toUserMessage = (customer) => ({
  customer_id: customer.customer_id,
  first_name: customer.first_name,
  last_name: customer.last_name,
  email: customer.email,
  city: customer.city ?? EMPTY_STRING,
  country: customer.country ?? EMPTY_STRING,
});

const normalizeEmail = (rawEmail) => {
  if (typeof rawEmail !== "string") {
    throw new AppError("Email is required", 400, "INVALID_EMAIL");
  }

  const email = rawEmail.trim();

  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new AppError("Email is invalid", 400, "INVALID_EMAIL");
  }

  return email;
};

export const createAuthHandlers = ({ customerRepository, sessionTokens, logger }) => {
  const login = async (call) => {
    const email = normalizeEmail(call.request.email);
    const customer = await customerRepository.findCustomerByEmail(email);

    if (!customer) {
      throw new AppError(
        "Unable to sign in with the provided email",
        401,
        "INVALID_LOGIN"
      );
    }

    const { token, sessionId } = await sessionTokens.createSessionToken(
      customer.customer_id
    );

    return {
      user: toUserMessage(customer),
      token,
      session_id: sessionId,
    };
  };

  const getCurrentUser = async (call) => {
    const customerId = call.request.customer_id?.trim();

    if (!customerId) {
      throw new AppError("Authentication is required", 401, "AUTH_REQUIRED");
    }

    const customer = await customerRepository.findCustomerById(customerId);

    if (!customer) {
      throw new AppError(
        "The authenticated customer no longer exists",
        401,
        "INVALID_SESSION"
      );
    }

    return toUserMessage(customer);
  };

  return {
    Login: grpcHandler(logger, login),
    GetCurrentUser: grpcHandler(logger, getCurrentUser),
  };
};