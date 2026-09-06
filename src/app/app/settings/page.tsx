import { getFactorySetup } from "@/modules/administration/admin.service";
import { FactorySetup } from "@/modules/administration/setup";
export default async function SettingsPage() { return <FactorySetup data={await getFactorySetup()}/>; }

