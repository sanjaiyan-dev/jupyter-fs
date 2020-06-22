/******************************************************************************
 *
 * Copyright (c) 2019, the jupyter-fs authors.
 *
 * This file is part of the jupyter-fs library, distributed under the terms of
 * the Apache License 2.0.  The full license can be found in the LICENSE file.
 *
 */
import { ILayoutRestorer, IRouter, JupyterFrontEnd, JupyterFrontEndPlugin } from "@jupyterlab/application";
import { IWindowResolver } from "@jupyterlab/apputils";
import { IDocumentManager } from "@jupyterlab/docmanager";
import { ISettingRegistry } from "@jupyterlab/settingregistry";
import { DisposableSet } from "@lumino/disposable";
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { FSComm, IFSResourceSpec } from "./filesystem";
import { FileTree } from "./filetree";
import {AskDialog} from "./auth";

// tslint:disable: variable-name

const plugin: JupyterFrontEndPlugin<void> = {
  activate,
  autoStart: true,
  id: "jupyter-fs:plugin",
  requires: [
    IDocumentManager,
    JupyterFrontEnd.IPaths,
    IWindowResolver,
    ILayoutRestorer,
    IRouter,
    ISettingRegistry,
  ],
};

async function activate(
  app: JupyterFrontEnd,
  manager: IDocumentManager,
  paths: JupyterFrontEnd.IPaths,
  resolver: IWindowResolver,
  restorer: ILayoutRestorer,
  router: IRouter,
  settingRegistry: ISettingRegistry,
) {
  const comm = new FSComm();
  let disposable = new DisposableSet();
  const sidebarProps: FileTree.ISidebarProps = {
    app,
    manager,
    paths,
    resolver,
    restorer,
    router,
  };

  // Attempt to load application settings
  let settings: ISettingRegistry.ISettings;
  try {
    settings = await settingRegistry.load(plugin.id);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to load settings for the jupyter-fs extension.\n${error}`);
  }

  async function refreshResources(specs: IFSResourceSpec[], verbose: boolean) {
    // send user specs to backend; await return containing resources
    // defined by user settings + resources defined by server config
    const resources = await comm.initResourceRequest(...specs);

    if (verbose) {
      // eslint-disable-next-line no-console
      console.info(`jupyter-fs frontend received resources:\n${resources}`);
    }

    // create the fs resource frontends (ie FileTree instances)
    for (const r of resources) {
      // make one composite disposable for all fs resource frontends
      disposable.add(FileTree.sidebarFromResource(r, sidebarProps));
    }
  }

  async function refresh() {
    // each disposable can only be disposed once
    disposable.dispose();
    disposable = new DisposableSet();

    // get user settings from json file
    const specs: IFSResourceSpec[] = settings.composite.specs as any;
    const verbose: boolean = settings.composite.verbose as any;

    const dialogElem = document.createElement('div');
    document.body.appendChild(dialogElem);

    const handleClose = () => {
      ReactDOM.unmountComponentAtNode(dialogElem);
      dialogElem.remove();
    }

    const handleSubmit = (values: {[url: string]: {[key: string]: string}}) => {
      refreshResources(specs.map(s => {s.values = values[s.url]; return s;}), verbose);
    }

    ReactDOM.render(
      <AskDialog
        handleClose={handleClose}
        handleSubmit={handleSubmit}
        resources={specs}
      />,
      dialogElem);
  }

  if (settings) {
    // initial setup
    refresh();

    // rerun setup whenever relevant settings change
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    settings.changed.connect(refresh);
  }
}

export default plugin;
export { activate as _activate };
