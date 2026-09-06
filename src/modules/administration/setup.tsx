import { getRequestMessages } from "@/lib/i18n/server";
import { ActionForm } from "@/components/action-form";
import { administrationAction } from "./actions";
import type { getFactorySetup } from "./admin.service";

function Field({
  name,
  label,
  type = "text",
  value,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        name={name}
        defaultValue={value}
        type={type}
        required
        minLength={type === "password" ? 10 : 1}
        maxLength={type === "password" ? 256 : 200}
        autoComplete={type === "password" ? "new-password" : undefined}
        className="mt-1 w-full rounded border p-2"
      />
    </label>
  );
}
async function Select({
  name,
  label,
  options,
  value,
  optional = false,
}: {
  name: string;
  label: string;
  options: { id: string; name: string }[];
  value?: string;
  optional?: boolean;
}) {
  const m = await getRequestMessages();
  return (
    <label className="block text-sm">
      {label}
      <select
        name={name}
        required={!optional}
        defaultValue={value ?? ""}
        className="mt-1 w-full rounded border p-2"
      >
        <option value="">{m.products.notSet}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export async function FactorySetup({
  data,
}: {
  data: Awaited<ReturnType<typeof getFactorySetup>>;
}) {
  const m = (await getRequestMessages()).operations;
  const can = (p: string) => data.permissions.includes(p);
  const section = "space-y-4 rounded-xl border bg-white p-5";
  const roleOptions = data.roles.filter((r) =>
    r.permissions.every((p) => can(p)),
  );
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-semibold">{m.administration}</h1>
      {can("users.manage") && can("access_roles.manage") ? (
        <section className={section}>
          <h2 className="text-xl font-semibold">{m.newUser}</h2>
          <ActionForm
            action={administrationAction}
            submit={m.newUser}
            testId="create-user"
          >
            <input type="hidden" name="operation" value="user" />
            <Field name="username" label={m.username} />
            <Field name="displayName" label={m.name} />
            <Field name="password" label={m.password} type="password" />
            <Select
              name="accessRoleId"
              label={m.accessRole}
              options={roleOptions}
            />
          </ActionForm>
        </section>
      ) : null}
      {can("users.manage") ? (
        <section className={section}>
          <h2 className="text-xl font-semibold">{m.users}</h2>
          {data.members.map((member) => (
            <details key={member.id} className="rounded border p-3">
              <summary className="cursor-pointer font-medium">
                {member.displayName ?? member.username} · {member.username}
              </summary>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <ActionForm
                  action={administrationAction}
                  submit={m.resetPassword}
                >
                  <input type="hidden" name="operation" value="password" />
                  <input type="hidden" name="membershipId" value={member.id} />
                  <Field type="password" name="password" label={m.password} />
                </ActionForm>
                {member.id !== data.membershipId &&
                can("access_roles.manage") ? (
                  <ActionForm
                    action={administrationAction}
                    submit={m.updateAccess}
                  >
                    <input type="hidden" name="operation" value="access" />
                    <input
                      type="hidden"
                      name="membershipId"
                      value={member.id}
                    />
                    <Select
                      name="accessRoleId"
                      label={m.accessRole}
                      options={roleOptions}
                      value={member.accessRoleIds[0]}
                    />
                    <label className="block text-sm">
                      <input
                        type="checkbox"
                        name="active"
                        value="true"
                        defaultChecked={member.active}
                      />{" "}
                      {m.activeStatus}
                    </label>
                  </ActionForm>
                ) : null}
                {member.employeeId && can("production_roles.manage") ? (
                  <ActionForm
                    action={administrationAction}
                    submit={m.assignRole}
                  >
                    <input type="hidden" name="operation" value="assignment" />
                    <input
                      type="hidden"
                      name="employeeId"
                      value={member.employeeId}
                    />
                    <Select
                      name="productionRoleId"
                      label={m.productionRole}
                      options={data.productionRoles}
                    />
                    <Select
                      name="handlingLocationId"
                      label={m.location}
                      options={data.locations}
                    />
                  </ActionForm>
                ) : null}
                <ul className="text-sm">
                  {member.productionAssignments.map((a, i) => (
                    <li key={i}>
                      {a.role} · {a.location}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </section>
      ) : null}
      {can("access_roles.manage") && can("permissions.manage") ? (
        <section className={section}>
          <h2 className="text-xl font-semibold">{m.roles}</h2>
          {[
            null,
            ...data.roles.filter(
              (r) => !r.isOwn && r.permissions.every((p) => can(p)),
            ),
          ].map((role) => (
            <details key={role?.id ?? "new"} className="rounded border p-3">
              <summary className="cursor-pointer">
                {role?.name ?? m.create}
              </summary>
              <div className="mt-3">
                <ActionForm action={administrationAction} submit={m.save}>
                  <input type="hidden" name="operation" value="role" />
                  {role ? (
                    <input type="hidden" name="id" value={role.id} />
                  ) : null}
                  <Field name="code" label={m.code} value={role?.code} />
                  <Field name="name" label={m.name} value={role?.name} />
                  <fieldset className="grid gap-2 sm:grid-cols-2">
                    <legend className="mb-2 text-sm font-medium">
                      {m.permissions}
                    </legend>
                    {data.permissions.map((p) => (
                      <label key={p} className="text-sm">
                        <input
                          type="checkbox"
                          name="permissions"
                          value={p}
                          defaultChecked={role?.permissions.includes(p)}
                        />{" "}
                        <span dir="ltr">{p}</span>
                      </label>
                    ))}
                  </fieldset>
                </ActionForm>
              </div>
            </details>
          ))}
        </section>
      ) : null}
      <div className="grid gap-6 sm:grid-cols-2">
        {(
          [
            ["department", m.departments, data.departments, "locations.manage"],
            [
              "productionRole",
              m.productionRoles,
              data.productionRoles,
              "production_roles.manage",
            ],
            [
              "productType",
              m.productTypes,
              data.productTypes,
              "products.create",
            ],
            ["customer", m.customers, data.customers, "products.create"],
          ] as const
        )
          .filter(([, , , permission]) => can(permission))
          .map(([kind, title, records]) => (
            <section key={kind} className={section}>
              <h2 className="text-xl font-semibold">{title}</h2>
              <ul className="max-h-40 overflow-auto text-sm">
                {records.map((r) => (
                  <li key={r.id}>{r.name}</li>
                ))}
              </ul>
              <ActionForm action={administrationAction} submit={m.create}>
                <input type="hidden" name="operation" value={kind} />
                {kind !== "customer" ? (
                  <Field name="code" label={m.code} />
                ) : null}
                <Field name="name" label={m.name} />
              </ActionForm>
            </section>
          ))}
        {can("locations.manage") ? (
          <section className={section}>
            <h2 className="text-xl font-semibold">{m.locations}</h2>
            <ul className="text-sm">
              {data.locations.map((l) => (
                <li key={l.id}>{l.name}</li>
              ))}
            </ul>
            <ActionForm action={administrationAction} submit={m.create}>
              <input type="hidden" name="operation" value="location" />
              <Field name="code" label={m.code} />
              <Field name="name" label={m.name} />
              <Select
                name="type"
                label={m.location}
                options={[
                  "DEPARTMENT",
                  "WORK_AREA",
                  "SAFE",
                  "STORAGE",
                  "WAITING",
                  "EXTERNAL",
                  "OTHER",
                ].map((t) => ({ id: t, name: t }))}
              />
              <Select
                name="departmentId"
                label={m.departments}
                options={data.departments}
                optional
              />
            </ActionForm>
          </section>
        ) : null}
        {can("products.create") ? (
          <section className={section}>
            <h2 className="text-xl font-semibold">{m.orders}</h2>
            <ul className="text-sm">
              {data.orders.map((o) => (
                <li key={o.id}>{o.orderNumber}</li>
              ))}
            </ul>
            <ActionForm action={administrationAction} submit={m.create}>
              <input type="hidden" name="operation" value="order" />
              <Field name="orderNumber" label={m.order} />
              <Select
                name="customerId"
                label={m.customer}
                options={data.customers}
                optional
              />
            </ActionForm>
          </section>
        ) : null}
      </div>
    </main>
  );
}
