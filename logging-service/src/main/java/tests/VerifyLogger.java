package tests;

import java.io.File;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import logger.*;

public class VerifyLogger {

    public static void main(String[] args) {
        System.out.println("==================================================");
        System.out.println("       LOGGING SERVICE AUTOMATED VERIFICATION      ");
        System.out.println("==================================================");

        boolean allPassed = true;
        try {
            allPassed &= testLevelThresholdFiltering();
            allPassed &= testHierarchyInheritance();
            allPassed &= testLockContentionAtomicWrites();
            allPassed &= testAsyncQueueBackpressureBlock();
            allPassed &= testAsyncQueueBackpressureDropNewest();
            allPassed &= testAsyncQueueBackpressureDropOldest();
            allPassed &= testAsyncQueueBackpressureThrow();
        } catch (Exception e) {
            System.err.println("❌ CRITICAL FAILURE during verification: " + e.getMessage());
            e.printStackTrace();
            allPassed = false;
        }

        System.out.println("==================================================");
        if (allPassed) {
            System.out.println("🟢 ALL TESTS PASSED SUCCESSFULLY! (100% Correct)");
            System.exit(0);
        } else {
            System.out.println("🔴 SOME VERIFICATION TESTS FAILED.");
            System.exit(1);
        }
    }

    private static boolean testLevelThresholdFiltering() throws Exception {
        System.out.print("Testing Level Threshold Filtering... ");
        LoggerManager.reset();
        
        Logger root = LoggerManager.getLogger("root");
        MemorySink mem = new MemorySink();
        
        Destination dest = new Destination(
            new PlainTextFormatter("{level}: {message}"),
            LogLevel.WARN,
            mem,
            false,
            10,
            QueueBackpressurePolicy.BLOCK
        );
        root.addDestination(dest);

        root.debug("Filtered out");
        root.info("Filtered out");
        root.warn("Should write");
        root.error("Should write");

        List<String> logs = mem.getLogs();
        if (logs.size() == 2 && logs.get(0).contains("WARN: Should write") && logs.get(1).contains("ERROR: Should write")) {
            System.out.println("PASS ✅");
            return true;
        } else {
            System.out.println("FAIL ❌ (Logs: " + logs + ")");
            return false;
        }
    }

    private static boolean testHierarchyInheritance() throws Exception {
        System.out.print("Testing Dotted Namespace Hierarchy Inheritance... ");
        LoggerManager.reset();

        Logger root = LoggerManager.getLogger("root");
        Logger parent = LoggerManager.getLogger("app");
        Logger child = LoggerManager.getLogger("app.service.db");

        MemorySink rootMem = new MemorySink();
        MemorySink parentMem = new MemorySink();

        root.addDestination(new Destination(new PlainTextFormatter("{message}"), LogLevel.DEBUG, rootMem, false, 10, QueueBackpressurePolicy.BLOCK));
        parent.addDestination(new Destination(new PlainTextFormatter("{message}"), LogLevel.DEBUG, parentMem, false, 10, QueueBackpressurePolicy.BLOCK));

        // Child inherits destinations from parent & root
        child.info("Test propagation");

        List<String> rLogs = rootMem.getLogs();
        List<String> pLogs = parentMem.getLogs();

        if (rLogs.size() == 1 && rLogs.get(0).equals("Test propagation") &&
            pLogs.size() == 1 && pLogs.get(0).equals("Test propagation")) {
            System.out.println("PASS ✅");
            return true;
        } else {
            System.out.println("FAIL ❌ (Root: " + rLogs + ", Parent: " + pLogs + ")");
            return false;
        }
    }

    private static boolean testLockContentionAtomicWrites() throws Exception {
        System.out.print("Testing Lock Contention & Atomic Writes... ");
        LoggerManager.reset();

        String tempFile = "temp_concurrency.log";
        new File(tempFile).delete();

        Logger root = LoggerManager.getLogger("root");
        FileSink fileSink = new FileSink(tempFile);
        
        Destination dest = new Destination(
            new PlainTextFormatter("{message}"),
            LogLevel.DEBUG,
            fileSink,
            false,
            1000,
            QueueBackpressurePolicy.BLOCK
        );
        root.addDestination(dest);

        int threadCount = 5;
        int logsPerThread = 100;
        List<Thread> threads = new ArrayList<>();
        
        for (int i = 0; i < threadCount; i++) {
            final int tid = i + 1;
            Thread t = new Thread(() -> {
                for (int c = 0; c < logsPerThread; c++) {
                    root.info("Thread-" + tid + " LogMsg-" + c);
                }
            });
            threads.add(t);
        }

        // Start concurrently
        for (Thread t : threads) t.start();
        for (Thread t : threads) t.join();

        dest.close();

        // Read log lines
        List<String> lines = java.nio.file.Files.readAllLines(new File(tempFile).toPath());
        new File(tempFile).delete();

        if (lines.size() == threadCount * logsPerThread) {
            System.out.println("PASS ✅ (" + lines.size() + " lines written atomically)");
            return true;
        } else {
            System.out.println("FAIL ❌ (Expected: " + (threadCount * logsPerThread) + ", Got: " + lines.size() + ")");
            return false;
        }
    }

    private static boolean testAsyncQueueBackpressureBlock() throws Exception {
        System.out.print("Testing Async Queue BLOCK Policy... ");
        LoggerManager.reset();

        Logger root = LoggerManager.getLogger("root");
        MemorySink mem = new MemorySink();
        
        // Very small queue (size 2), slow sink mock
        Sink slowSink = new Sink() {
            @Override
            public void write(String formatted) {
                try { Thread.sleep(200); } catch (Exception e) {}
                mem.write(formatted);
            }
        };

        Destination dest = new Destination(
            new PlainTextFormatter("{message}"),
            LogLevel.DEBUG,
            slowSink,
            true, // ASYNC Mode
            2,    // Capacity 2!
            QueueBackpressurePolicy.BLOCK
        );
        root.addDestination(dest);

        long start = System.currentTimeMillis();
        
        // Log 5 times. Slots: 2 in queue, 1 active in sink, 4th and 5th should block!
        root.info("Msg 1");
        root.info("Msg 2");
        root.info("Msg 3");
        root.info("Msg 4");
        root.info("Msg 5");

        long duration = System.currentTimeMillis() - start;
        dest.close();

        // Since it blocked, duration must be at least 200-400ms
        if (duration >= 200 && mem.getLogs().size() == 5) {
            System.out.println("PASS ✅ (Blocked correctly, duration: " + duration + "ms)");
            return true;
        } else {
            System.out.println("FAIL ❌ (Logs: " + mem.getLogs().size() + ", duration: " + duration + "ms)");
            return false;
        }
    }

    private static boolean testAsyncQueueBackpressureDropNewest() throws Exception {
        System.out.print("Testing Async Queue DROP_NEWEST Policy... ");
        LoggerManager.reset();

        Logger root = LoggerManager.getLogger("root");
        MemorySink mem = new MemorySink();
        
        // Sleep sink to hold queue full
        Sink slowSink = new Sink() {
            @Override
            public void write(String formatted) {
                try { Thread.sleep(100); } catch (Exception e) {}
                mem.write(formatted);
            }
        };

        Destination dest = new Destination(
            new PlainTextFormatter("{message}"),
            LogLevel.DEBUG,
            slowSink,
            true,
            2, // Capacity 2
            QueueBackpressurePolicy.DROP_NEWEST
        );
        root.addDestination(dest);

        // Put 5 logs instantly. Queue is full at 3, logs 4 & 5 should be instantly dropped.
        root.info("Keep 1");
        root.info("Keep 2");
        root.info("Keep 3");
        root.info("Drop 4");
        root.info("Drop 5");

        dest.close();

        List<String> logs = mem.getLogs();
        if (logs.size() == 3 && logs.get(0).equals("Keep 1") && logs.get(1).equals("Keep 2") && logs.get(2).equals("Keep 3")) {
            System.out.println("PASS ✅");
            return true;
        } else {
            System.out.println("FAIL ❌ (Logs: " + logs + ")");
            return false;
        }
    }

    private static boolean testAsyncQueueBackpressureDropOldest() throws Exception {
        System.out.print("Testing Async Queue DROP_OLDEST Policy... ");
        LoggerManager.reset();

        Logger root = LoggerManager.getLogger("root");
        MemorySink mem = new MemorySink();
        
        Sink slowSink = new Sink() {
            @Override
            public void write(String formatted) {
                try { Thread.sleep(100); } catch (Exception e) {}
                mem.write(formatted);
            }
        };

        Destination dest = new Destination(
            new PlainTextFormatter("{message}"),
            LogLevel.DEBUG,
            slowSink,
            true,
            2,
            QueueBackpressurePolicy.DROP_OLDEST
        );
        root.addDestination(dest);

        // Send 5 items.
        // Item 1: actively processing in sink.
        // Item 2, 3: placed in queue. Queue capacity (2) is full.
        // Item 4: Queue is full. Drop oldest in queue (Item 2). Queue now has [Item 3, Item 4].
        // Item 5: Queue is full. Drop oldest in queue (Item 3). Queue now has [Item 4, Item 5].
        root.info("Item 1"); // processing
        root.info("Item 2"); // in queue, will be dropped
        root.info("Item 3"); // in queue, will be dropped
        root.info("Item 4"); // replaces Item 2
        root.info("Item 5"); // replaces Item 3

        dest.close();

        List<String> logs = mem.getLogs();
        // Should contain Item 1, Item 4, Item 5
        if (logs.size() == 3 && logs.contains("Item 1") && logs.contains("Item 4") && logs.contains("Item 5")) {
            System.out.println("PASS ✅");
            return true;
        } else {
            System.out.println("FAIL ❌ (Logs: " + logs + ")");
            return false;
        }
    }

    private static boolean testAsyncQueueBackpressureThrow() throws Exception {
        System.out.print("Testing Async Queue THROW Policy... ");
        LoggerManager.reset();

        Logger root = LoggerManager.getLogger("root");
        MemorySink mem = new MemorySink();
        
        Sink slowSink = new Sink() {
            @Override
            public void write(String formatted) {
                try { Thread.sleep(200); } catch (Exception e) {}
                mem.write(formatted);
            }
        };

        Destination dest = new Destination(
            new PlainTextFormatter("{message}"),
            LogLevel.DEBUG,
            slowSink,
            true,
            2,
            QueueBackpressurePolicy.THROW
        );
        root.addDestination(dest);

        root.info("Ok 1"); // active
        root.info("Ok 2"); // queued
        root.info("Ok 3"); // queued (full)

        boolean threw = false;
        try {
            root.info("Should Throw"); // should throw QueueFullException
        } catch (Destination.QueueFullException e) {
            threw = true;
        }

        dest.close();

        if (threw) {
            System.out.println("PASS ✅ (Threw QueueFullException correctly)");
            return true;
        } else {
            System.out.println("FAIL ❌ (Exception was not thrown)");
            return false;
        }
    }
}
