import { describe, it, expect, beforeEach } from 'vitest';
import { Gateway } from '../src/gateway.js';
import type { Config } from '../src/config.js';

describe('Gateway', () => {
  let gateway: Gateway;

  beforeEach(() => {
    gateway = new Gateway();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const config = gateway.getConfig();
      expect(config.listen).toBe('0.0.0.0');
      expect(config.port).toBe(9999);
      expect(config.servers).toEqual([]);
      expect(config.logLevel).toBe('info');
    });

    it('should merge partial config', () => {
      const gw = new Gateway({ port: 8888, logLevel: 'debug' });
      const config = gw.getConfig();
      expect(config.port).toBe(8888);
      expect(config.logLevel).toBe('debug');
      expect(config.listen).toBe('0.0.0.0'); // default preserved
    });
  });

  describe('isRunning', () => {
    it('should return false initially', () => {
      expect(gateway.isRunning()).toBe(false);
    });
  });

  describe('listServers', () => {
    it('should return empty array initially', () => {
      expect(gateway.listServers()).toEqual([]);
    });
  });

  describe('getServer', () => {
    it('should return undefined for unknown ID', () => {
      expect(gateway.getServer('unknown-id')).toBeUndefined();
    });
  });

  describe('listTools', () => {
    it('should return empty array when no servers', async () => {
      const tools = await gateway.listTools();
      expect(tools).toEqual([]);
    });
  });

  describe('listResources', () => {
    it('should return empty array when no servers', async () => {
      const resources = await gateway.listResources();
      expect(resources).toEqual([]);
    });
  });

  describe('stop', () => {
    it('should be idempotent when not running', async () => {
      await gateway.stop();
      expect(gateway.isRunning()).toBe(false);
    });
  });

  describe('callTool', () => {
    it('should throw when server not found', async () => {
      await expect(gateway.callTool('unknown', 'test', {})).rejects.toThrow(
        'Server not found',
      );
    });
  });

  describe('readResource', () => {
    it('should throw when server not found', async () => {
      await expect(gateway.readResource('unknown', 'uri')).rejects.toThrow(
        'Server not found',
      );
    });
  });

  describe('disconnectServer', () => {
    it('should throw when server not found', async () => {
      await expect(gateway.disconnectServer('unknown')).rejects.toThrow(
        'Server not found',
      );
    });
  });
});
