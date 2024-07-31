import { useEffect, useState, useMemo, useRef, Suspense } from 'react';
import FileTable from './FileTable';
import { Button, Typography, Flex, StatusIndicator } from '@neo4j-ndl/react';
import { useCredentials } from '../context/UserCredentials';
import { useFileContext } from '../context/UsersFiles';
import CustomAlert from './UI/Alert';
import { extractAPI } from '../utils/FileAPI';
import {
  ChildRef,
  ContentProps,
  CustomFile,
  OptionType,
  UserCredentials,
  alertStateType,
  connectionState,
} from '../types';
import deleteAPI from '../services/DeleteFiles';
import { postProcessing } from '../services/PostProcessing';
import { triggerStatusUpdateAPI } from '../services/ServerSideStatusUpdateAPI';
import useServerSideEvent from '../hooks/useSse';
import { useSearchParams } from 'react-router-dom';
import { buttonCaptions, defaultLLM, fileProcessingLimit, largeFileSize, llms, taskParam, tooltips } from '../utils/Constants';
import ButtonWithToolTip from './UI/ButtonWithToolTip';
import connectAPI from '../services/ConnectAPI';
import DropdownComponent from './Dropdown';
import GraphViewModal from './Graph/GraphViewModal';
import { OverridableStringUnion } from '@mui/types';
import { AlertColor, AlertPropsColorOverrides } from '@mui/material';
import { lazy } from 'react';
import FallBackDialog from './UI/FallBackDialog';
import DeletePopUp from './Popups/DeletePopUp/DeletePopUp';
import GraphEnhancementDialog from './Popups/GraphEnhancementDialog';
const ConnectionModal = lazy(() => import('./Popups/ConnectionModal/ConnectionModal'));
const ConfirmationDialog = lazy(() => import('./Popups/LargeFilePopUp/ConfirmationDialog'));

const Content: React.FC<ContentProps> = ({
  isLeftExpanded,
  isRightExpanded,
  isSchema,
  setIsSchema,
  showEnhancementDialog,
  setshowEnhancementDialog,
  closeSettingModal,
}) => {
  const [init, setInit] = useState<boolean>(false);
  const [openConnection, setOpenConnection] = useState<connectionState>({
    isvectorIndexMatch: true,
    openPopUp: false,
    novectorindexInDB: true,
  });
  const [openGraphView, setOpenGraphView] = useState<boolean>(false);
  const [inspectedName, setInspectedName] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<boolean>(false);
  const { setUserCredentials, userCredentials } = useCredentials();
  const [showConfirmationModal, setshowConfirmationModal] = useState<boolean>(false);
  const [extractLoading, setextractLoading] = useState<boolean>(false);
  const {
    filesData,
    setFilesData,
    setModel,
    model,
    selectedNodes,
    selectedRels,
    setSelectedNodes,
    setRowSelection,
    setSelectedRels,
    processedCount, setProcessedCount
  } = useFileContext();
  const [viewPoint, setViewPoint] = useState<'tableView' | 'showGraphView' | 'chatInfoView'>('tableView');
  const [showDeletePopUp, setshowDeletePopUp] = useState<boolean>(false);
  const [deleteLoading, setdeleteLoading] = useState<boolean>(false);
  const [searchParams] = useSearchParams();
  const [alertDetails, setalertDetails] = useState<alertStateType>({
    showAlert: false,
    alertType: 'error',
    alertMessage: '',
  });

  const [hasAlertedUser, setHasAlertedUser] = useState<boolean>(false);
  const { updateStatusForLargeFiles } = useServerSideEvent(
    (inMinutes, time, fileName) => {
      setalertDetails({
        showAlert: true,
        alertType: 'info',
        alertMessage: `${fileName} will take approx ${time} ${inMinutes ? 'Min' : 'Sec'}`,
      });
      localStorage.setItem('alertShown', JSON.stringify(true));
    },
    (fileName) => {
      setalertDetails({
        showAlert: true,
        alertType: 'error',
        alertMessage: `${fileName} Failed to process`,
      });
    }
  );
  const childRef = useRef<ChildRef>(null);
  const openGraphEnhancementDialog = () => {
    setshowEnhancementDialog(true);
  };
  const closeGraphEnhancementDialog = () => {
    setshowEnhancementDialog(false);
  };
  const showAlert = (
    alertmsg: string,
    alerttype: OverridableStringUnion<AlertColor, AlertPropsColorOverrides> | undefined
  ) => {
    setalertDetails({
      showAlert: true,
      alertMessage: alertmsg,
      alertType: alerttype,
    });
  };
  useEffect(() => {
    if (!init && !searchParams.has('connectURL')) {
      let session = localStorage.getItem('neo4j.connection');
      if (session) {
        let neo4jConnection = JSON.parse(session);
        setUserCredentials({
          uri: neo4jConnection.uri,
          userName: neo4jConnection.user,
          password: neo4jConnection.password,
          database: neo4jConnection.database,
          port: neo4jConnection.uri.split(':')[2],
        });
      } else {
        setOpenConnection((prev) => ({ ...prev, openPopUp: true }));
      }
      setInit(true);
    } else {
      setOpenConnection((prev) => ({ ...prev, openPopUp: true }));
    }
  }, []);

  useEffect(() => {
    setFilesData((prevfiles) => {
      return prevfiles.map((curfile) => {
        return { ...curfile, model: curfile.status === 'New' ? model : curfile.model };
      });
    });
  }, [model]);

  const handleDropdownChange = (selectedOption: OptionType | null | void) => {
    if (selectedOption?.value) {
      setModel(selectedOption?.value);
    }
  };

  const leftFiles = childRef?.current?.getSelectedRows().filter((f) => f.status === 'Waiting');
  console.log('leftFiles',leftFiles);

  useEffect(() => {
    if (processedCount === 2) {
      processNextBatch(leftFiles as CustomFile[]);
      console.log('hello', processedCount);
    }
  }, [processedCount]);

  const extractHandler = async (fileItem: CustomFile, uid: string) => {
    try {
      setFilesData((prevFiles) =>
        prevFiles.map((curFile) =>
          curFile.id
            === uid
            ? { ...curFile, status: 'Processing' }
            : curFile
        )
      );
      setRowSelection((prev) => ({
        ...prev,
        [uid]: false,
      }));
      if (fileItem.name && userCredentials) {
        await triggerStatusUpdateAPI(
          fileItem.name,
          userCredentials.uri,
          userCredentials.userName,
          userCredentials.password,
          userCredentials.database,
          updateStatusForLargeFiles,
          setProcessedCount
        );
      }
      const apiResponse = await extractAPI(
        fileItem.model,
        userCredentials as UserCredentials,
        fileItem.fileSource,
        fileItem.source_url,
        localStorage.getItem('accesskey'),
        localStorage.getItem('secretkey'),
        fileItem.name ?? '',
        fileItem.gcsBucket ?? '',
        fileItem.gcsBucketFolder ?? '',
        selectedNodes.map((l) => l.value),
        selectedRels.map((t) => t.value),
        fileItem.google_project_id,
        fileItem.language,
        fileItem.access_token
      );
      if (apiResponse?.status === 'Failed') {
        throw new Error(JSON.stringify({
          error: apiResponse.error,
          message: apiResponse.message,
          fileName: apiResponse.file_name,
        }));
      } else if (fileItem.size && fileItem.size < largeFileSize) {
        setFilesData((prevFiles) =>
          prevFiles.map((curFile) =>
            curFile.name === apiResponse?.data?.fileName
              ? {
                ...curFile,
                processing: apiResponse?.data?.processingTime?.toFixed(2),
                status: apiResponse?.data?.status,
                NodesCount: apiResponse?.data?.nodeCount,
                relationshipCount: apiResponse?.data?.relationshipCount,
                model: apiResponse?.data?.model,
              }
              : curFile
          )
        );
      }
      return apiResponse;
    } catch (err: any) {
      const error = JSON.parse(err.message);
      if ('fileName' in error) {
        const { message, fileName, errorMessage } = error;
        setalertDetails({
          showAlert: true,
          alertType: 'error',
          alertMessage: message,
        });
        setFilesData((prevFiles) =>
          prevFiles.map((curFile) =>
            curFile.name === fileName
              ? { ...curFile, status: 'Failed', errorMessage }
              : curFile
          )
        );
      }
      return error;
    }
  };

  const processBatch = async (batch: CustomFile[]) => {
    // batch.forEach((file) => (file.status = 'Processing'));
    const batchPromises = batch.map((file) => extractData(file.id as string, true));
    await Promise.allSettled(batchPromises);
    const results = await Promise.allSettled(batchPromises);
    results.forEach((result, index) => {
      const file = batch[index];
      console.log('results file', result);
      if (result.status === 'fulfilled') {
        file.status = result?.value?.data.status;
      } else {
        file.status = 'Failed';
        console.error(`Error processing file ${file.id}:`, result.reason);
      }
    });
  };

  const processNextBatch = async (tempFiles: CustomFile[]) => {
    while (tempFiles.length > 0) {
      const batchSize: number = fileProcessingLimit > 0 ? fileProcessingLimit : tempFiles.length;
      const nextBatch = tempFiles.splice(0, batchSize);
      console.log('batch', nextBatch);
      await processBatch(nextBatch);
    }
    setextractLoading(false);
    await postProcessing(userCredentials as UserCredentials, taskParam);
  };

  const addToQueue = (files: CustomFile[]) => {
    const tempFiles: CustomFile[] = [];
    files.forEach((file) => {
      if (file.status === 'New') {
        file.status = 'Waiting';
        tempFiles.push(file);
      }
    });
    return tempFiles;
  };

  const handleGenerateGraph = async (allowLargeFiles: boolean, selectedFilesFromAllFiles: CustomFile[]) => {
    let tempFilesToBeProcessed: CustomFile[] = [];
    if (selectedfileslength && allowLargeFiles) {
      const row = childRef.current?.getSelectedRows();
      if (row) {
        tempFilesToBeProcessed = addToQueue(row);
      } else {
        tempFilesToBeProcessed = addToQueue(selectedFilesFromAllFiles);
      }
    } else if (selectedFilesFromAllFiles.length && allowLargeFiles) {
      const selectedRows = childRef.current?.getSelectedRows();
      if (selectedRows) {
        addToQueue(selectedRows);
      } else {
        addToQueue(selectedFilesFromAllFiles);
      }
    }
    if (processedCount === 1) {
      setProcessedCount(0);
    }
    await processNextBatch(tempFilesToBeProcessed);
  };

  const extractData = async (uid: string, isSelectedRows = false) => {
    const fileItem = isSelectedRows
      ? childRef.current?.getSelectedRows().find((f) =>
        f.id
        === uid)
      : filesData.find((f) =>
        f.id
        === uid);
    if (fileItem) {
      setextractLoading(true);
      if (!hasAlertedUser) {
        setalertDetails({
          showAlert: true,
          alertMessage: 'Processing 2 files at a time.',
          alertType: 'info',
        });
        setHasAlertedUser(true);
      }
      const resp = await extractHandler(fileItem, uid);
      return resp;
    }
  };

  const handleClose = () => {
    setalertDetails((prev) => ({ ...prev, showAlert: false, alertMessage: '' }));
  };

  const handleOpenGraphClick = () => {
    const bloomUrl = process.env.BLOOM_URL;
    const uriCoded = userCredentials?.uri.replace(/:\d+$/, '');
    const connectURL = `${uriCoded?.split('//')[0]}//${userCredentials?.userName}@${uriCoded?.split('//')[1]}:${userCredentials?.port ?? '7687'
      }`;
    const encodedURL = encodeURIComponent(connectURL);
    const replacedUrl = bloomUrl?.replace('{CONNECT_URL}', encodedURL);
    window.open(replacedUrl, '_blank');
  };

  const classNameCheck =
    isLeftExpanded && isRightExpanded
      ? 'contentWithExpansion'
      : isRightExpanded
        ? 'contentWithChatBot'
        : !isLeftExpanded && !isRightExpanded
          ? 'w-[calc(100%-128px)]'
          : 'contentWithDropzoneExpansion';

  const handleGraphView = () => {
    setOpenGraphView(true);
    setViewPoint('showGraphView');
  };

  const disconnect = () => {
    setConnectionStatus(false);
    localStorage.removeItem('password');
    setUserCredentials({ uri: '', password: '', userName: '', database: '' });
    setSelectedNodes([]);
    setSelectedRels([]);
  };

  const selectedfileslength = useMemo(
    () => childRef.current?.getSelectedRows().length,
    [childRef.current?.getSelectedRows()]
  );

  const newFilecheck = useMemo(
    () => childRef.current?.getSelectedRows().filter((f) => f.status === 'New').length,
    [childRef.current?.getSelectedRows()]
  );

  const completedfileNo = useMemo(
    () => childRef.current?.getSelectedRows().filter((f) => f.status === 'Completed').length,
    [childRef.current?.getSelectedRows()]
  );

  const dropdowncheck = useMemo(() => !filesData.some((f) => f.status === 'New'), [filesData]);

  const disableCheck = useMemo(
    () => (!selectedfileslength ? dropdowncheck : !newFilecheck),
    [selectedfileslength, filesData, newFilecheck]
  );

  const showGraphCheck = useMemo(
    () => (selectedfileslength ? completedfileNo === 0 : true),
    [selectedfileslength, completedfileNo]
  );

  const filesForProcessing = useMemo(() => {
    let newstatusfiles: CustomFile[] = [];
    if (childRef.current?.getSelectedRows().length) {
      childRef.current?.getSelectedRows().forEach((f) => {
        const parsedFile: CustomFile = f;
        if (parsedFile.status === 'New') {
          newstatusfiles.push(parsedFile);
        }
      });
    } else if (filesData.length) {
      newstatusfiles = filesData.filter((f) => f.status === 'New');
    }
    return newstatusfiles;
  }, [filesData, childRef.current?.getSelectedRows()]);

  const handleDeleteFiles = async (deleteEntities: boolean) => {
    try {
      setdeleteLoading(true);
      const response = await deleteAPI(
        userCredentials as UserCredentials,
        childRef.current?.getSelectedRows() as CustomFile[],
        deleteEntities
      );
      setRowSelection({});
      setdeleteLoading(false);
      if (response.data.status == 'Success') {
        setalertDetails({
          showAlert: true,
          alertMessage: response.data.message,
          alertType: 'success',
        });
        const filenames = childRef.current?.getSelectedRows().map((str) => str.name);
        filenames?.forEach((name) => {
          setFilesData((prev) => prev.filter((f) => f.name != name));
        });
      } else {
        let errorobj = { error: response.data.error, message: response.data.message };
        throw new Error(JSON.stringify(errorobj));
      }
      setshowDeletePopUp(false);
    } catch (err) {
      setdeleteLoading(false);
      if (err instanceof Error) {
        const error = JSON.parse(err.message);
        const { message } = error;
        setalertDetails({
          showAlert: true,
          alertType: 'error',
          alertMessage: message,
        });
        console.log(err);
      }
    }
    setshowDeletePopUp(false);
  };
  useEffect(() => {
    const connection = localStorage.getItem('neo4j.connection');
    if (connection != null) {
      (async () => {
        const parsedData = JSON.parse(connection);
        console.log(parsedData.uri);
        const response = await connectAPI(parsedData.uri, parsedData.user, parsedData.password, parsedData.database);
        if (response?.data?.status === 'Success') {
          localStorage.setItem(
            'neo4j.connection',
            JSON.stringify({
              ...parsedData,
              userDbVectorIndex: response.data.data.db_vector_dimension,
            })
          );
          if (response.data.data.application_dimension === response.data.data.db_vector_dimension) {
            setConnectionStatus(true);
            setOpenConnection((prev) => ({ ...prev, openPopUp: false }));
          } else {
            setOpenConnection({
              isvectorIndexMatch: false,
              openPopUp: true,
              novectorindexInDB: response.data.data.db_vector_dimension === 0,
            });
            setConnectionStatus(false);
          }
        } else {
          setOpenConnection((prev) => ({ ...prev, openPopUp: true }));
          setConnectionStatus(false);
        }
      })();
    }
  }, []);

  useEffect(() => {
    const storedSchema = localStorage.getItem('isSchema');
    if (storedSchema !== null) {
      setIsSchema(JSON.parse(storedSchema));
    }
  }, [isSchema]);

  const onClickHandler = () => {
    if (childRef.current?.getSelectedRows().length) {
      let selectedLargeFiles: CustomFile[] = [];
      childRef.current?.getSelectedRows().forEach((f) => {
        const parsedData: CustomFile = f;
        if (parsedData.fileSource === 'local file') {
          if (typeof parsedData.size === 'number' && parsedData.status === 'New' && parsedData.size > largeFileSize) {
            selectedLargeFiles.push(parsedData);
          }
        }
      });
      if (selectedLargeFiles.length) {
        setshowConfirmationModal(true);
        handleGenerateGraph(false, []);
      } else {
        handleGenerateGraph(true, filesData);
      }
    } else if (filesData.length) {
      const largefiles = filesData.filter((f) => {
        if (typeof f.size === 'number' && f.status === 'New' && f.size > largeFileSize) {
          return true;
        }
        return false;
      });
      const selectAllNewFiles = filesData.filter((f) => f.status === 'New');
      const stringified = selectAllNewFiles.reduce((accu, f) => {
        const key = f.id;
        // @ts-ignore
        accu[key] = true;
        return accu;
      }, {});
      setRowSelection(stringified);
      if (largefiles.length) {
        setshowConfirmationModal(true);
        handleGenerateGraph(false, []);
      } else {
        handleGenerateGraph(true, filesData);
      }
    }
  };

  return (
    <>
      {alertDetails.showAlert && (
        <CustomAlert
          severity={alertDetails.alertType}
          open={alertDetails.showAlert}
          handleClose={handleClose}
          alertMessage={alertDetails.alertMessage}
        />
      )}
      {isSchema && (
        <CustomAlert
          severity={alertDetails.alertType}
          open={alertDetails.showAlert}
          handleClose={handleClose}
          alertMessage={alertDetails.alertMessage}
        />
      )}
      {showConfirmationModal && filesForProcessing.length && (
        <Suspense fallback={<FallBackDialog />}>
          <ConfirmationDialog
            open={showConfirmationModal}
            largeFiles={filesForProcessing}
            extractHandler={handleGenerateGraph}
            onClose={() => setshowConfirmationModal(false)}
            loading={extractLoading}
          ></ConfirmationDialog>
        </Suspense>
      )}
      {showDeletePopUp && (
        <DeletePopUp
          open={showDeletePopUp}
          no_of_files={selectedfileslength ?? 0}
          deleteHandler={(delentities: boolean) => handleDeleteFiles(delentities)}
          deleteCloseHandler={() => setshowDeletePopUp(false)}
          loading={deleteLoading}
          view='contentView'
        ></DeletePopUp>
      )}
      {showEnhancementDialog && (
        <GraphEnhancementDialog
          open={showEnhancementDialog}
          onClose={closeGraphEnhancementDialog}
          closeSettingModal={closeSettingModal}
          showAlert={showAlert}
        ></GraphEnhancementDialog>
      )}
      <div className={`n-bg-palette-neutral-bg-default ${classNameCheck}`}>
        <Flex className='w-full' alignItems='center' justifyContent='space-between' flexDirection='row'>
          <Suspense fallback={<FallBackDialog />}>
            <ConnectionModal
              open={openConnection.openPopUp}
              setOpenConnection={setOpenConnection}
              setConnectionStatus={setConnectionStatus}
              isVectorIndexMatch={openConnection.isvectorIndexMatch}
              noVectorIndexFound={openConnection.novectorindexInDB}
            />
          </Suspense>

          <div className='connectionstatus__container'>
            <span className='h6 px-1'>Neo4j connection</span>
            <Typography variant='body-medium'>
              {!connectionStatus ? <StatusIndicator type='danger' /> : <StatusIndicator type='success' />}
              {connectionStatus ? (
                <span className='n-body-small'>{userCredentials?.uri}</span>
              ) : (
                <span className='n-body-small'>Not Connected</span>
              )}
              <div className='pt-1'>
                {!isSchema ? (
                  <StatusIndicator type='danger' />
                ) : selectedNodes.length || selectedRels.length ? (
                  <StatusIndicator type='success' />
                ) : (
                  <StatusIndicator type='warning' />
                )}
                {isSchema ? (
                  <span className='n-body-small'>
                    {(!selectedNodes.length || !selectedNodes.length) && 'Empty'} Graph Schema configured
                    {selectedNodes.length || selectedRels.length
                      ? `(${selectedNodes.length} Labels + ${selectedRels.length} Rel Types)`
                      : ''}
                  </span>
                ) : (
                  <span className='n-body-small'>No Graph Schema configured</span>
                )}
              </div>
            </Typography>
          </div>
          <div>
            <ButtonWithToolTip
              placement='top'
              text='Configure Graph Schema, Delete disconnected Entities, Merge duplicate Entities'
              label='Graph Enhancemnet Settings'
              className='mr-2.5'
              onClick={openGraphEnhancementDialog}
              disabled={!connectionStatus}
            >
              Graph Enhancement
            </ButtonWithToolTip>
            {!connectionStatus ? (
              <Button className='mr-2.5' onClick={() => setOpenConnection((prev) => ({ ...prev, openPopUp: true }))}>
                {buttonCaptions.connectToNeo4j}
              </Button>
            ) : (
              <Button className='mr-2.5' onClick={disconnect}>
                {buttonCaptions.disconnect}
              </Button>
            )}
          </div>
        </Flex>
        <FileTable
          isExpanded={isLeftExpanded && isRightExpanded}
          connectionStatus={connectionStatus}
          setConnectionStatus={setConnectionStatus}
          onInspect={(name) => {
            setInspectedName(name);
            setOpenGraphView(true);
            setViewPoint('tableView');
          }}
          ref={childRef}
        ></FileTable>
        <Flex
          className={`${!isLeftExpanded && !isRightExpanded ? 'w-[calc(100%-128px)]' : 'w-full'
            } p-2.5 absolute bottom-4 mt-1.5 self-start`}
          justifyContent='space-between'
          flexDirection='row'
        >
          <DropdownComponent
            onSelect={handleDropdownChange}
            options={llms ?? ['']}
            placeholder='Select LLM Model'
            defaultValue={defaultLLM}
            view='ContentView'
            isDisabled={false}
          />
          <Flex flexDirection='row' gap='4' className='self-end'>
            <ButtonWithToolTip
              text={tooltips.generateGraph}
              placement='top'
              label='generate graph'
              onClick={onClickHandler}
              disabled={disableCheck}
              className='mr-0.5'
            >
              {buttonCaptions.generateGraph}{' '}
              {selectedfileslength && !disableCheck && newFilecheck ? `(${newFilecheck})` : ''}
            </ButtonWithToolTip>
            <ButtonWithToolTip
              text={tooltips.showGraph}
              placement='top'
              onClick={handleGraphView}
              disabled={showGraphCheck}
              className='mr-0.5'
              label='show graph'
            >
              {buttonCaptions.showPreviewGraph} {selectedfileslength && completedfileNo ? `(${completedfileNo})` : ''}
            </ButtonWithToolTip>
            <ButtonWithToolTip
              text={tooltips.bloomGraph}
              placement='top'
              onClick={handleOpenGraphClick}
              disabled={!filesData.some((f) => f?.status === 'Completed')}
              className='ml-0.5'
              label='Open Graph with Bloom'
            >
              {buttonCaptions.exploreGraphWithBloom}
            </ButtonWithToolTip>
            <ButtonWithToolTip
              text={
                !selectedfileslength ? tooltips.deleteFile : `${selectedfileslength} ${tooltips.deleteSelectedFiles}`
              }
              placement='top'
              onClick={() => setshowDeletePopUp(true)}
              disabled={!selectedfileslength}
              className='ml-0.5'
              label='Delete Files'
            >
              {buttonCaptions.deleteFiles}
              {selectedfileslength != undefined && selectedfileslength > 0 && `(${selectedfileslength})`}
            </ButtonWithToolTip>
          </Flex>
        </Flex>
      </div>
      <GraphViewModal
        inspectedName={inspectedName}
        open={openGraphView}
        setGraphViewOpen={setOpenGraphView}
        viewPoint={viewPoint}
        selectedRows={childRef.current?.getSelectedRows()}
      />
    </>
  );
};

export default Content;
