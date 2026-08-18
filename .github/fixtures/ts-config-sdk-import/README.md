A verbatra.config.ts fixture, in sync, that imports defineConfig from
@verbatra/sdk directly instead of @verbatra/cli. Some existing projects use
this import; the action must install and resolve @verbatra/sdk at the exact
pinned version regardless of which of the two packages a config imports from.
