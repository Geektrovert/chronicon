import { Layer, Logger, ManagedRuntime, References } from "effect";
import * as BunCrypto from "@effect/platform-bun/BunCrypto";
import * as BunFileSystem from "@effect/platform-bun/BunFileSystem";
import * as BunPath from "@effect/platform-bun/BunPath";
import { AppConfig } from "./config";
import { databaseLayer } from "./database";
import { Storage } from "./services/storage";
import { EmailDelivery } from "./services/email";
import { Auth } from "./auth";
import { SearchService } from "./services/search";
import { serviceAttributes } from "./observability";

export const infrastructureLayer = Layer.mergeAll(Auth.layer, SearchService.layer).pipe(
  Layer.provideMerge(Layer.mergeAll(databaseLayer, Storage.layer, EmailDelivery.layer)),
  Layer.provideMerge(AppConfig.layer),
  Layer.provideMerge(Layer.mergeAll(BunCrypto.layer, BunFileSystem.layer, BunPath.layer)),
  Layer.provideMerge(Logger.layer([Logger.consoleJson])),
  Layer.provideMerge(Layer.sync(References.CurrentLogAnnotations, serviceAttributes)),
);

const makeRuntime = () => ManagedRuntime.make(infrastructureLayer);

export type AppServices = Layer.Success<typeof infrastructureLayer>;

// SAFETY: This process-wide registry is an optional property used only to reuse the warm service graph.
const shared = globalThis as typeof globalThis & {
  chroniconRuntime?: ReturnType<typeof makeRuntime>;
};

// One service graph per warm process, including Next development reloads.
export const runtime = (shared.chroniconRuntime ??= makeRuntime());
