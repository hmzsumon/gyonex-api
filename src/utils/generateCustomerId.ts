import { User } from "@/models/user.model";
import { v4 as uuidv4 } from "uuid";

export const generateUniqueId = async (): Promise<string> => {
  while (true) {
    const id = `U${uuidv4().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

    const exists = await User.exists({ customer_id: id });

    if (!exists) {
      return id;
    }
  }
};
