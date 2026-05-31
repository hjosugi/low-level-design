package server;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.CopyOnWriteArrayList;
import logger.EventBus;
import logger.Logger;
import logger.LoggerManager;
import logger.LogLevel;

public class SimulationRunner {
    private static final List<SimulationInstance> activeSimulations = new CopyOnWriteArrayList<>();

    private static class SimulationInstance {
        private final List<Thread> threads = new ArrayList<>();
        private volatile boolean running = true;

        public void stop() {
            running = false;
            for (Thread t : threads) {
                t.interrupt();
            }
        }
    }

    public static void startSimulation(
        int numThreads,
        int logsPerThread,
        double intervalSeconds,
        String loggerName,
        List<LogLevel> levels
    ) {
        // Stop any active simulations first
        stopAllSimulations();

        Logger logger = LoggerManager.getLogger(loggerName);
        SimulationInstance instance = new SimulationInstance();
        Random rand = new Random();

        for (int i = 0; i < numThreads; i++) {
            final int threadIdx = i + 1;
            Thread t = new Thread(() -> {
                String threadName = "SimThread-" + threadIdx;
                Thread.currentThread().setName(threadName);

                for (int count = 0; count < logsPerThread; count++) {
                    if (!instance.running || Thread.currentThread().isInterrupted()) {
                        break;
                    }

                    LogLevel lvl = levels.get(rand.nextInt(levels.size()));
                    String msg = "Simulated message " + (count + 1) + " from " + threadName + " (Level: " + lvl.name() + ")";
                    
                    try {
                        logger.log(lvl, msg);
                    } catch (Exception e) {
                        // Capture throw policy exceptions and notify EventBus
                        EventBus.emit("simulation_exception", Map.of(
                            "thread", threadName,
                            "error", e.getMessage() == null ? e.toString() : e.getMessage(),
                            "type", e.getClass().getSimpleName()
                        ));
                    }

                    try {
                        long sleepMillis = (long) (intervalSeconds * 1000 + rand.nextInt(20) - 10);
                        if (sleepMillis > 0) {
                            Thread.sleep(sleepMillis);
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            });

            instance.threads.add(t);
        }

        activeSimulations.add(instance);
        
        // Start all threads
        for (Thread t : instance.threads) {
            t.start();
        }
    }

    public static void stopAllSimulations() {
        for (SimulationInstance sim : activeSimulations) {
            sim.stop();
        }
        activeSimulations.clear();
    }
}
