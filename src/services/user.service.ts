import { IUser, User } from "@/models/user.model";
import "module-alias/register";

export const createUserService = async (
  data: Partial<IUser>
): Promise<IUser> => {
  const user = new User(data);
  return await user.save();
};

export const getAllUsersService = async (): Promise<IUser[]> => {
  return await User.find();
};

export const getUserByIdService = async (id: string): Promise<IUser | null> => {
  return await User.findById(id);
};

export const updateUserService = async (
  id: string,
  data: Partial<IUser>
): Promise<IUser | null> => {
  return await User.findByIdAndUpdate(id, data, { new: true });
};

export const deleteUserService = async (id: string): Promise<IUser | null> => {
  return await User.findByIdAndDelete(id);
};
