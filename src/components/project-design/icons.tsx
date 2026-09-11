"use client";

import {
  Coffee,
  ShoppingCart,
  Wallet,
  Plus,
  Settings,
  House,
  CreditCard,
  X,
  Car,
  Tv,
} from "lucide-react";
import {
  IconCoffee,
  IconShoppingCart,
  IconWallet,
  IconPlus,
  IconSettings,
  IconHome,
  IconCreditCard,
  IconX,
  IconCar,
  IconDeviceTv,
} from "@tabler/icons-react";
import {
  CoffeeIcon,
  ShoppingCartIcon,
  WalletIcon,
  PlusIcon,
  GearIcon,
  HouseIcon,
  CreditCardIcon,
  XIcon,
  CarIcon,
  TelevisionIcon,
} from "@phosphor-icons/react";
import {
  RiCupLine,
  RiShoppingCartLine,
  RiWalletLine,
  RiAddLine,
  RiSettingsLine,
  RiHomeLine,
  RiBankCardLine,
  RiCloseLine,
  RiCarLine,
  RiTvLine,
} from "@remixicon/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Coffee01Icon,
  ShoppingCart01Icon,
  Wallet01Icon,
  Add01Icon,
  Settings01Icon,
  Home01Icon,
  CreditCardIcon as HugeCreditCard,
  Cancel01Icon,
  Car01Icon,
  Tv01Icon,
} from "@hugeicons/core-free-icons";
import { useGallery } from "./gallery-context";

const lucide = {
  coffee: Coffee,
  cart: ShoppingCart,
  wallet: Wallet,
  plus: Plus,
  settings: Settings,
  home: House,
  card: CreditCard,
  close: X,
  car: Car,
  tv: Tv,
};

const tabler = {
  coffee: IconCoffee,
  cart: IconShoppingCart,
  wallet: IconWallet,
  plus: IconPlus,
  settings: IconSettings,
  home: IconHome,
  card: IconCreditCard,
  close: IconX,
  car: IconCar,
  tv: IconDeviceTv,
};

const phosphor = {
  coffee: CoffeeIcon,
  cart: ShoppingCartIcon,
  wallet: WalletIcon,
  plus: PlusIcon,
  settings: GearIcon,
  home: HouseIcon,
  card: CreditCardIcon,
  close: XIcon,
  car: CarIcon,
  tv: TelevisionIcon,
};

const remixicon = {
  coffee: RiCupLine,
  cart: RiShoppingCartLine,
  wallet: RiWalletLine,
  plus: RiAddLine,
  settings: RiSettingsLine,
  home: RiHomeLine,
  card: RiBankCardLine,
  close: RiCloseLine,
  car: RiCarLine,
  tv: RiTvLine,
};

const hugeicons = {
  coffee: Coffee01Icon,
  cart: ShoppingCart01Icon,
  wallet: Wallet01Icon,
  plus: Add01Icon,
  settings: Settings01Icon,
  home: Home01Icon,
  card: HugeCreditCard,
  close: Cancel01Icon,
  car: Car01Icon,
  tv: Tv01Icon,
};

export type DesignIconName = keyof typeof lucide;

export function DesignIcon({
  name,
  className = "size-5",
}: {
  name: DesignIconName;
  className?: string;
}) {
  const library = useGallery().settings.iconLibrary;

  if (library === "hugeicons")
    return (
      <HugeiconsIcon
        icon={hugeicons[name]}
        className={className}
        aria-hidden="true"
        strokeWidth={1.8}
      />
    );
  const Icon = { lucide, tabler, phosphor, remixicon }[library][name];

  return <Icon className={className} aria-hidden="true" />;
}
