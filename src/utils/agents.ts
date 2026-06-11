export interface IUserInfo {
  name: string;
  email: string;
  phone: string;
  password: string;
  passCode: string;
}

export interface IAgent {
  name: string;
  email: string;
  phone: string;
  password: string;
  user: IUserInfo;
}

export const agents: IAgent[] = [
  {
    name: "Default Agent",
    email: "defaultagent@gmail.com",
    phone: "01849280681",
    password: "Sa112200@",
    user: {
      name: "Kenneth Johnson",
      email: "kenneth31johnson12@gmail.com",
      phone: "01849280681",
      password: "Sa112200@",
      passCode: "112200",
    },
  },

  {
    name: "Cp Agent01",
    email: "cpagent01@gmail.com",
    phone: "01715123456",
    password: "Su112200@",
    user: {
      name: "Cp User01",
      email: "cpuser01@gmail.com",
      phone: "01715123457",
      password: "Su112200@",
      passCode: "112200",
    },
  },
  {
    name: "Cp Agent02",
    email: "cpagent02@gmail.com",
    phone: "01715123458",
    password: "Su112200@",
    user: {
      name: "Cp User02",
      email: "cpuser02@gmail.com",
      phone: "01715123459",
      password: "Su112200@",
      passCode: "112200",
    },
  },
  {
    name: "Cp Agent03",
    email: "cpagent03@gmail.com",
    phone: "01715123460",
    password: "Su112200@",
    user: {
      name: "Cp User03",
      email: "cpuser03@gmail.com",
      phone: "01715123461",
      password: "Su112200@",
      passCode: "112200",
    },
  },
  {
    name: "Cp Agent04",
    email: "cpagent04@gmail.com",
    phone: "01715123462",
    password: "Su112200@",
    user: {
      name: "Cp User04",
      email: "cpuser04@gmail.com",
      phone: "01715123463",
      password: "Su112200@",
      passCode: "112200",
    },
  },
];
